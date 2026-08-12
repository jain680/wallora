/**
 * Wallora wall mask engine — Parts A/B/D
 *
 * Part A: Geometric boundary detection (LAB + Sobel + validation)
 * Part B: Quadrilateral mask fill + LAB object exclusion + feathered edges
 * Part D: LAB BFS fallback when geometry fails
 */

// ─── Part D fallback parameters ─────────────────────────────────────────────
const FALLBACK_DELTA_E = 22
// Lighting-gradient Sobel edges (e.g. backlit wall near a window) are softer than
// true material boundaries — raise block threshold ~35% so fill isn't stopped early.
// Tradeoff: slightly higher risk of bleeding into low-contrast adjacent surfaces.
const FALLBACK_EDGE_BLOCK = 54
const FALLBACK_HOLE_FILL_NEIGHBORS = 6
const FALLBACK_HOLE_FILL_PASSES = 3

// Weighted delta-E: de-weight L (window backlight / shadow gradients on same wall)
// and up-weight A/B (hue/material changes like wall → curtain still block growth).
const L_WEIGHT = 0.4
const CHROMA_WEIGHT = 1.3

// Debug overlay: show only the strongest ~22% of Sobel edges as thin red outlines.
const DEBUG_EDGE_TOP_PERCENT = 0.78

// Scan-fill tolerance inside geometric wall bounds — looser than BFS so backlit wall
// pixels fill evenly; chroma weight still excludes curtains / window glass.
const GEOMETRIC_FILL_DELTA_E = 32

// Exclude curtains/windows by chroma only — ignore L so backlight doesn't create holes.
const CHROMA_EXCLUDE_DELTA = 30

// Object exclusion (Part B secondary pass) — tune per photo for lighting / wall color.
/** LAB delta-E above dominant wall color → treat pixel as non-wall (window, curtain, art). */
const EXCLUSION_DELTA_E = 28
/** Ignore exclusion blobs smaller than this (speckle / sensor noise, not real objects). */
const EXCLUSION_MIN_HOLE_AREA = 40
/** Morphological closing radius (dilate then erode) to merge noisy exclusion pixels. */
const EXCLUSION_MORPH_RADIUS = 2
/** If exclusion would remove more than this fraction of the quad, skip it (bad wall-color sample). */
const EXCLUSION_MAX_REMOVED_RATIO = 0.35
/** Inset from quad edges when sampling dominant wall color (0.30 = central 40% band). */
const WALL_COLOR_SAMPLE_INSET_RATIO = 0.3

/** Mean edge-map value in a window above this → textured non-wall (curtain folds, frames). */
const EDGE_DENSITY_THRESHOLD = 42
const EDGE_DENSITY_RADIUS = 4
/** Max wall-zone width as fraction of image — above this, tighten via local vertical peaks. */
const MAX_WALL_ZONE_WIDTH_RATIO = 0.52
/** Inset from detected vertical zone edges — keeps fill off corners/curtain seams. */
const ZONE_BOUNDARY_INSET = 3

/** Feather width in px — partial alpha 0–255 at mask boundaries for smooth paint blend. */
const MASK_FEATHER_RADIUS = 2

const MAX_MASK_DIMENSION = 1280

export { MAX_MASK_DIMENSION }

// ─── Part A parameters ──────────────────────────────────────────────────────
const MIN_VERTICAL_SEPARATION_RATIO = 0.08
const MAX_VERTICAL_CANDIDATES = 6
const RIGHT_ZONE_RATIO = 0.3
const RIGHT_EDGE_MIN_RATIO = 0.6
const SUBPIXEL_SEARCH_PX = 5
const SUBPIXEL_STEP = 0.5
const LAB_DELTA_VALIDATE = 5
const GRADIENT_TOP_PERCENT = 0.85
const INSET_PX = 1

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SlopedLine {
  slope: number
  intercept: number
}

export interface WallBoundaries {
  width: number
  height: number
  verticalLines: number[]
  topLine: SlopedLine
  bottomLine: SlopedLine
  /** Normalized edge magnitude 0–255 for corner-shadow rendering. */
  edgeMap: Uint8Array
  columnStrength: Float32Array
}

export interface WallCornerPoints {
  topLeft: { x: number; y: number }
  topRight: { x: number; y: number }
  bottomLeft: { x: number; y: number }
  bottomRight: { x: number; y: number }
}

export interface WallMaskResult {
  mask: Uint8ClampedArray
  /** geometric = even color fill inside detected wall quadrilateral */
  method: 'geometric' | 'fallback' | 'hybrid'
  zoneLeft: number
  zoneRight: number
  /** Pixels removed from the quad by object exclusion (for debug overlay). */
  excludedMask?: Uint8ClampedArray
  /** Exact corner intersections used to build the quad. */
  quadCorners?: WallCornerPoints
}

// ─── Color / LAB helpers ─────────────────────────────────────────────────────

function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  let x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375
  let y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175
  let z = lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041

  x /= 0.95047
  z /= 1.08883

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function buildLabPlanes(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { L: Float32Array; A: Float32Array; B: Float32Array } {
  const size = width * height
  const L = new Float32Array(size)
  const A = new Float32Array(size)
  const B = new Float32Array(size)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const pi = i * 4
      const lab = rgbToLab(data[pi], data[pi + 1], data[pi + 2])
      L[i] = lab[0]
      A[i] = lab[1]
      B[i] = lab[2]
    }
  }

  return { L, A, B }
}


function slopedY(line: SlopedLine, x: number): number {
  return line.slope * x + line.intercept
}

function weightedDeltaE(
  L: number,
  A: number,
  B: number,
  L0: number,
  A0: number,
  B0: number
): number {
  const dL = (L - L0) * L_WEIGHT
  const dA = (A - A0) * CHROMA_WEIGHT
  const dB = (B - B0) * CHROMA_WEIGHT
  return Math.sqrt(dL * dL + dA * dA + dB * dB)
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0
  values.sort((a, b) => a - b)
  const mid = Math.floor(values.length / 2)
  return values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2
}

// ─── Part A: Sobel edge maps ─────────────────────────────────────────────────

function buildSobelMaps(L: Float32Array, width: number, height: number) {
  const gxRaw = new Float32Array(width * height)
  const gyRaw = new Float32Array(width * height)
  const magRaw = new Float32Array(width * height)
  let maxMag = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const tl = L[(y - 1) * width + (x - 1)]
      const tc = L[(y - 1) * width + x]
      const tr = L[(y - 1) * width + (x + 1)]
      const ml = L[y * width + (x - 1)]
      const mr = L[y * width + (x + 1)]
      const bl = L[(y + 1) * width + (x - 1)]
      const bc = L[(y + 1) * width + x]
      const br = L[(y + 1) * width + (x + 1)]

      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br
      const mag = Math.sqrt(gx * gx + gy * gy)

      gxRaw[idx] = Math.abs(gx)
      gyRaw[idx] = Math.abs(gy)
      magRaw[idx] = mag
      if (mag > maxMag) maxMag = mag
    }
  }

  const edgeMap = new Uint8Array(width * height)
  const scale = maxMag > 0 ? 255 / maxMag : 0
  for (let i = 0; i < magRaw.length; i++) {
    if (magRaw[i] > 0) edgeMap[i] = Math.min(255, Math.round(magRaw[i] * scale))
  }

  return { gxRaw, gyRaw, magRaw, edgeMap, maxMag }
}

function computeColumnStrength(gxRaw: Float32Array, width: number, height: number): Float32Array {
  const strength = new Float32Array(width)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      strength[x] += gxRaw[y * width + x]
    }
  }
  return strength
}

function sampleColumnStrength(strength: Float32Array, x: number, width: number): number {
  const xi = Math.max(1, Math.min(width - 2, x))
  const xf = Math.floor(xi)
  const frac = xi - xf
  if (xf >= width - 1) return strength[width - 2]
  return strength[xf] * (1 - frac) + strength[xf + 1] * frac
}

function refineVerticalLine(strength: Float32Array, x: number, width: number): number {
  let bestX = x
  let bestScore = -1
  for (let dx = -SUBPIXEL_SEARCH_PX; dx <= SUBPIXEL_SEARCH_PX; dx += SUBPIXEL_STEP) {
    const score = sampleColumnStrength(strength, x + dx, width)
    if (score > bestScore) {
      bestScore = score
      bestX = x + dx
    }
  }
  return Math.round(bestX)
}

function gradientThreshold(magRaw: Float32Array): number {
  const samples: number[] = []
  for (let i = 0; i < magRaw.length; i++) {
    if (magRaw[i] > 0) samples.push(magRaw[i])
  }
  if (samples.length === 0) return Infinity
  samples.sort((a, b) => a - b)
  const idx = Math.floor(samples.length * GRADIENT_TOP_PERCENT)
  return samples[Math.min(idx, samples.length - 1)]
}

function validateVerticalLine(
  x: number,
  L: Float32Array,
  A: Float32Array,
  B: Float32Array,
  gxRaw: Float32Array,
  width: number,
  height: number,
  topGrad: number
): boolean {
  const xL = Math.max(1, x - 4)
  const xR = Math.min(width - 2, x + 4)
  const yStart = Math.floor(height * 0.25)
  const yEnd = Math.floor(height * 0.75)

  let lL = 0
  let aL = 0
  let bL = 0
  let lR = 0
  let aR = 0
  let bR = 0
  let gradSum = 0
  let count = 0

  for (let y = yStart; y <= yEnd; y++) {
    const iL = y * width + xL
    const iR = y * width + xR
    lL += L[iL]
    aL += A[iL]
    bL += B[iL]
    lR += L[iR]
    aR += A[iR]
    bR += B[iR]
    gradSum += gxRaw[y * width + x]
    count++
  }

  if (count === 0) return false

  const dL = lL / count - lR / count
  const dA = aL / count - aR / count
  const dB = bL / count - bR / count
  const colorDiff = Math.sqrt(dL * dL + dA * dA + dB * dB)
  const avgGrad = gradSum / count

  return colorDiff > LAB_DELTA_VALIDATE || avgGrad >= topGrad
}

function pickVerticalLines(
  columnStrength: Float32Array,
  gxRaw: Float32Array,
  magRaw: Float32Array,
  L: Float32Array,
  A: Float32Array,
  B: Float32Array,
  width: number,
  height: number
): { verticalLines: number[]; rightZoneMaxStrength: number; maxStrength: number } {
  const minSep = Math.max(1, Math.floor(width * MIN_VERTICAL_SEPARATION_RATIO))
  const topGrad = gradientThreshold(magRaw)
  const maxStrength = Math.max(...Array.from(columnStrength))

  const ranked = Array.from({ length: width - 2 }, (_, i) => i + 1).sort(
    (a, b) => columnStrength[b] - columnStrength[a]
  )

  const validated: number[] = []

  for (const col of ranked) {
    if (validated.length >= MAX_VERTICAL_CANDIDATES) break
    if (columnStrength[col] <= 0) continue
    if (validated.some((v) => Math.abs(v - col) < minSep)) continue

    const refined = refineVerticalLine(columnStrength, col, width)
    if (!validateVerticalLine(refined, L, A, B, gxRaw, width, height, topGrad)) continue

    validated.push(refined)
  }

  // Secondary pass: rightmost 30% for lower-contrast corners
  const rightStart = Math.floor(width * (1 - RIGHT_ZONE_RATIO))
  const rightRanked = ranked.filter((c) => c >= rightStart)

  let rightZoneMaxStrength = 0
  for (let x = rightStart; x <= width - 2; x++) {
    if (columnStrength[x] > rightZoneMaxStrength) {
      rightZoneMaxStrength = columnStrength[x]
    }
  }

  const minRightStrength = rightZoneMaxStrength * RIGHT_EDGE_MIN_RATIO

  for (const col of rightRanked) {
    if (validated.length >= MAX_VERTICAL_CANDIDATES) break
    if (columnStrength[col] < minRightStrength) continue
    if (validated.some((v) => Math.abs(v - col) < minSep)) continue

    const refined = refineVerticalLine(columnStrength, col, width)
    if (!validateVerticalLine(refined, L, A, B, gxRaw, width, height, topGrad)) continue
    if (validated.includes(refined)) continue

    validated.push(refined)
  }

  // Third pass: if validation rejected everything, use strongest column as fallback divider
  if (validated.length === 0 && ranked.length > 0) {
    const strongest = ranked[0]
    if (columnStrength[strongest] > 0) {
      validated.push(refineVerticalLine(columnStrength, strongest, width))
    }
  }

  return {
    verticalLines: validated.sort((a, b) => a - b),
    rightZoneMaxStrength,
    maxStrength,
  }
}

function fitSlopedLine(points: { x: number; y: number }[], fallbackY: number): SlopedLine {
  if (points.length < 3) return { slope: 0, intercept: fallbackY }

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  const n = points.length

  for (const p of points) {
    sumX += p.x
    sumY += p.y
    sumXY += p.x * p.y
    sumXX += p.x * p.x
  }

  const denom = n * sumXX - sumX * sumX
  if (Math.abs(denom) < 1e-6) return { slope: 0, intercept: fallbackY }

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

function clampSlope(line: SlopedLine, maxAbsSlope: number): SlopedLine {
  if (Math.abs(line.slope) <= maxAbsSlope) return line
  const midX = 256
  const midY = slopedY(line, midX)
  return { slope: 0, intercept: midY - line.slope * midX }
}

function computeRowStrengthInZone(
  gyRaw: Float32Array,
  width: number,
  x0: number,
  x1: number,
  yMin: number,
  yMax: number
): Float32Array {
  const height = gyRaw.length / width
  const rowScore = new Float32Array(height)
  for (let y = yMin; y <= yMax; y++) {
    for (let x = x0; x <= x1; x++) {
      rowScore[y] += gyRaw[y * width + x]
    }
  }
  return rowScore
}

/** Detect ceiling or floor line using the center strip of a wall zone (avoids window/corners). */
function detectHorizontalLineForZone(
  gyRaw: Float32Array,
  width: number,
  height: number,
  x0: number,
  x1: number,
  isTop: boolean,
  gradThreshold: number
): SlopedLine {
  const stripW = x1 - x0
  const margin = Math.max(2, Math.floor(stripW * 0.18))
  const sx0 = x0 + margin
  const sx1 = x1 - margin
  if (sx1 <= sx0) return { slope: 0, intercept: isTop ? height * 0.11 : height * 0.8 }

  const yMin = isTop ? Math.floor(height * 0.04) : Math.floor(height * 0.62)
  const yMax = isTop ? Math.floor(height * 0.26) : Math.floor(height * 0.9)

  const rowScore = computeRowStrengthInZone(gyRaw, width, sx0, sx1, yMin, yMax)
  let maxScore = 0
  for (let y = yMin; y <= yMax; y++) maxScore = Math.max(maxScore, rowScore[y])
  const cutoff = maxScore * 0.15

  let edgeY = isTop ? yMax : yMin
  for (let y = yMin; y <= yMax; y++) {
    if (rowScore[y] < cutoff) continue
    if (isTop && y <= edgeY) edgeY = y
    if (!isTop && y >= edgeY) edgeY = y
  }

  const points: { x: number; y: number }[] = []
  const band = Math.max(8, Math.floor(height * 0.04))
  const thresh = gradThreshold * 0.4

  for (let x = sx0; x <= sx1; x += 3) {
    let bestY = edgeY
    const yLo = isTop ? Math.max(yMin, edgeY - 2) : Math.max(yMin, edgeY - band)
    const yHi = isTop ? Math.min(yMax, edgeY + band) : Math.min(yMax, edgeY + 2)
    for (let y = yLo; y <= yHi; y++) {
      const gy = gyRaw[y * width + x]
      if (gy < thresh) continue
      if (isTop && y <= bestY) bestY = y
      if (!isTop && y >= bestY) bestY = y
    }
    points.push({ x, y: bestY })
  }

  if (points.length < 3) return { slope: 0, intercept: edgeY }
  return fitSlopedLine(points, edgeY)
}

function smooth1DArray(values: Float32Array, radius: number): void {
  const tmp = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) {
    let sum = 0
    let count = 0
    for (let d = -radius; d <= radius; d++) {
      const j = i + d
      if (j >= 0 && j < values.length) {
        sum += values[j]
        count++
      }
    }
    tmp[i] = count > 0 ? sum / count : values[i]
  }
  values.set(tmp)
}

/**
 * Per-column ceiling/floor edge snap — follows perspective on side walls better than one global line.
 */
function buildEdgeSnappedClipMask(
  left: number,
  right: number,
  gyRaw: Float32Array,
  width: number,
  height: number,
  gradThreshold: number
): { mask: Uint8ClampedArray; topLine: SlopedLine; bottomLine: SlopedLine } {
  const mask = new Uint8ClampedArray(width * height)
  const x0 = Math.max(0, Math.floor(left))
  const x1 = Math.min(width - 1, Math.ceil(right))
  const colCount = x1 - x0 + 1
  if (colCount <= 0) {
    return { mask, topLine: { slope: 0, intercept: height * 0.1 }, bottomLine: { slope: 0, intercept: height * 0.8 } }
  }

  const topYs = new Float32Array(colCount)
  const botYs = new Float32Array(colCount)
  const topBandMin = Math.floor(height * 0.02)
  const topBandMax = Math.floor(height * 0.34)
  const botBandMin = Math.floor(height * 0.56)
  const botBandMax = Math.floor(height * 0.93)
  const gyThresh = gradThreshold * 0.32

  for (let xi = 0; xi < colCount; xi++) {
    const x = x0 + xi

    let bestTopY = topBandMin
    let bestTopGy = 0
    for (let y = topBandMin; y <= topBandMax; y++) {
      const gy = gyRaw[y * width + x]
      if (gy > bestTopGy) {
        bestTopGy = gy
        bestTopY = y
      }
    }
    topYs[xi] = bestTopGy > 0 ? bestTopY : height * 0.1

    let bestBotY = botBandMax
    let foundBot = false
    for (let y = botBandMin; y <= botBandMax; y++) {
      const gy = gyRaw[y * width + x]
      if (gy >= gyThresh) {
        bestBotY = y
        foundBot = true
        break
      }
    }
    if (!foundBot) {
      let maxGy = 0
      for (let y = botBandMin; y <= botBandMax; y++) {
        const gy = gyRaw[y * width + x]
        if (gy > maxGy) {
          maxGy = gy
          bestBotY = y
        }
      }
    }
    botYs[xi] = bestBotY
  }

  smooth1DArray(topYs, 4)
  smooth1DArray(botYs, 4)

  for (let xi = 0; xi < colCount; xi++) {
    const x = x0 + xi
    const yStart = Math.max(0, Math.ceil(topYs[xi] + ZONE_BOUNDARY_INSET))
    const yEnd = Math.min(height - 1, Math.floor(botYs[xi] - ZONE_BOUNDARY_INSET))
    if (yEnd <= yStart) continue
    for (let y = yStart; y <= yEnd; y++) {
      mask[y * width + x] = 255
    }
  }

  const topPoints: { x: number; y: number }[] = []
  const botPoints: { x: number; y: number }[] = []
  for (let xi = 0; xi < colCount; xi += 2) {
    const x = x0 + xi
    topPoints.push({ x, y: topYs[xi] })
    botPoints.push({ x, y: botYs[xi] })
  }

  return {
    mask,
    topLine: fitSlopedLine(topPoints, topYs[0]),
    bottomLine: fitSlopedLine(botPoints, botYs[0]),
  }
}

function findVerticalPeaks(columnStrength: Float32Array, width: number): number[] {
  const maxS = Math.max(...Array.from(columnStrength.slice(1, width - 1)), 1)
  const threshold = maxS * 0.28
  const minSep = Math.max(10, Math.floor(width * 0.08))
  const peaks: number[] = []

  for (let x = 4; x < width - 4; x++) {
    const s = columnStrength[x]
    if (s < threshold) continue
    if (s >= columnStrength[x - 1] && s >= columnStrength[x + 1]) {
      if (peaks.length === 0 || x - peaks[peaks.length - 1] >= minSep) {
        peaks.push(x)
      } else if (s > columnStrength[peaks[peaks.length - 1]]) {
        peaks[peaks.length - 1] = x
      }
    }
  }
  return peaks
}

function columnArgmax(columnStrength: Float32Array, x0: number, x1: number): number {
  let bestX = x0
  let bestS = -1
  for (let x = x0; x <= x1; x++) {
    if (columnStrength[x] > bestS) {
      bestS = columnStrength[x]
      bestX = x
    }
  }
  return bestX
}

/** Which wall slab was clicked — narrowest divider slab, with side/back wall heuristics. */
function getWallZoneForClick(
  clickX: number,
  boundaries: WallBoundaries
): { left: number; right: number } {
  const { width, verticalLines, columnStrength } = boundaries
  const peaks = findVerticalPeaks(columnStrength, width)
  const dividers = Array.from(new Set([0, ...verticalLines, ...peaks, width - 1])).sort(
    (a, b) => a - b
  )

  let left = 0
  let right = width - 1
  for (let i = 0; i < dividers.length - 1; i++) {
    if (clickX >= dividers[i] && clickX <= dividers[i + 1]) {
      left = dividers[i]
      right = dividers[i + 1]
      break
    }
  }

  const maxZone = width * MAX_WALL_ZONE_WIDTH_RATIO
  if (right - left > maxZone) {
    const maxDist = width * 0.34
    let nearLeft = left
    let nearRight = right
    for (const x of dividers) {
      if (x < clickX && clickX - x <= maxDist && x > nearLeft) nearLeft = x
      if (x > clickX && x - clickX <= maxDist && x < nearRight) nearRight = x
    }
    if (nearRight - nearLeft >= width * 0.1) {
      left = nearLeft
      right = nearRight
    }
  }

  // Side-wall click: clamp left to interior corner (avoid spanning back wall + side wall).
  if (clickX > width * 0.52 && right - left > width * 0.38) {
    const cornerX = columnArgmax(
      columnStrength,
      Math.floor(width * 0.46),
      Math.min(Math.floor(width * 0.74), Math.floor(clickX - width * 0.04))
    )
    if (cornerX < clickX && columnStrength[cornerX] > columnStrength[left] * 0.35) {
      left = cornerX
    }
  }

  // Back-wall click: clamp right to interior corner; left to window frame.
  if (clickX < width * 0.62 && right - left > width * 0.38) {
    const cornerX = columnArgmax(
      columnStrength,
      Math.max(Math.floor(clickX + width * 0.04), Math.floor(width * 0.48)),
      Math.floor(width * 0.76)
    )
    if (cornerX > clickX && columnStrength[cornerX] > columnStrength[right] * 0.35) {
      right = cornerX
    }
  }
  if (clickX < width * 0.58 && left < width * 0.12) {
    const windowX = columnArgmax(
      columnStrength,
      Math.floor(width * 0.16),
      Math.min(Math.floor(width * 0.44), Math.floor(clickX - width * 0.03))
    )
    if (windowX < clickX && columnStrength[windowX] > columnStrength[left] * 0.25) {
      left = windowX
    }
  }

  return { left, right }
}

function detectWallZoneForClick(
  clickX: number,
  verticalLines: number[],
  width: number
): { left: number; right: number } {
  return getWallZone(clickX, width, verticalLines)
}

export interface WallQuad {
  topLine: SlopedLine
  bottomLine: SlopedLine
  left: number
  right: number
}

/**
 * Wall quad = per-zone ceiling/floor lines × vertical zone containing the click.
 * Uses local vertical peaks when global dividers span too much of the frame.
 */
export function buildWallQuadForClick(
  imageData: ImageData,
  clickX: number,
  clickY: number,
  boundaries?: WallBoundaries
): WallQuad {
  const b = boundaries ?? detectWallBoundaries(imageData)
  const { width, height } = b
  const { left, right } = getWallZoneForClick(clickX, b)

  const { L } = buildLabPlanes(imageData.data, width, height)
  const { gyRaw, magRaw } = buildSobelMaps(L, width, height)
  const topGrad = gradientThreshold(magRaw)
  const snapped = buildEdgeSnappedClipMask(left, right, gyRaw, width, height, topGrad)

  return { topLine: snapped.topLine, bottomLine: snapped.bottomLine, left, right }
}

function ensureCornerVerticalLines(
  verticalLines: number[],
  columnStrength: Float32Array,
  width: number
): number[] {
  const result = new Set(verticalLines)

  const argmaxInRange = (xStart: number, xEnd: number): number | null => {
    let bestX = xStart
    let bestS = -1
    for (let x = xStart; x <= xEnd; x++) {
      if (columnStrength[x] > bestS) {
        bestS = columnStrength[x]
        bestX = x
      }
    }
    return bestS > 0 ? bestX : null
  }

  const left = argmaxInRange(Math.floor(width * 0.1), Math.floor(width * 0.44))
  const right = argmaxInRange(Math.floor(width * 0.56), Math.floor(width * 0.92))
  if (left !== null) result.add(left)
  if (right !== null) result.add(right)

  return Array.from(result).sort((a, b) => a - b)
}

function paintGeometricQuadOutline(
  out: Uint8ClampedArray,
  width: number,
  height: number,
  topLine: SlopedLine,
  bottomLine: SlopedLine,
  left: number,
  right: number
): void {
  const corners = computeWallQuadCorners(topLine, bottomLine, left, right)
  paintCornerQuadOutline(out, width, height, corners)
}

function paintCornerQuadOutline(
  out: Uint8ClampedArray,
  width: number,
  height: number,
  corners: WallCornerPoints
): void {
  const setGreen = (x: number, y: number) => {
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || px >= width || py < 0 || py >= height) return
    for (const oy of [-1, 0, 1]) {
      for (const ox of [-1, 0, 1]) {
        const gx = px + ox
        const gy = py + oy
        if (gx < 0 || gx >= width || gy < 0 || gy >= height) continue
        const pi = (gy * width + gx) * 4
        out[pi] = 24
        out[pi + 1] = 255
        out[pi + 2] = 72
      }
    }
  }

  const steps = Math.max(
    2,
    Math.ceil(
      Math.max(
        Math.abs(corners.topRight.x - corners.topLeft.x),
        Math.abs(corners.bottomRight.x - corners.bottomLeft.x),
        Math.abs(corners.bottomLeft.y - corners.topLeft.y),
        Math.abs(corners.bottomRight.y - corners.topRight.y)
      )
    )
  )

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    setGreen(
      corners.topLeft.x + t * (corners.topRight.x - corners.topLeft.x),
      corners.topLeft.y + t * (corners.topRight.y - corners.topLeft.y)
    )
    setGreen(
      corners.bottomLeft.x + t * (corners.bottomRight.x - corners.bottomLeft.x),
      corners.bottomLeft.y + t * (corners.bottomRight.y - corners.bottomLeft.y)
    )
    setGreen(
      corners.topLeft.x + t * (corners.bottomLeft.x - corners.topLeft.x),
      corners.topLeft.y + t * (corners.bottomLeft.y - corners.topLeft.y)
    )
    setGreen(
      corners.topRight.x + t * (corners.bottomRight.x - corners.topRight.x),
      corners.topRight.y + t * (corners.bottomRight.y - corners.topRight.y)
    )
  }
}

function detectSlopedHorizontalLine(
  gyRaw: Float32Array,
  width: number,
  height: number,
  topRegion: boolean,
  gradThreshold: number
): SlopedLine {
  // Top: ceiling–wall band. Bottom: wall–floor band (extended toward skirting board).
  const yStart = topRegion ? 1 : Math.floor(height * 0.48)
  const yEnd = topRegion ? Math.floor(height * 0.28) : Math.floor(height * 0.82)
  const fallbackY = topRegion ? Math.floor(height * 0.08) : Math.floor(height * 0.72)
  const points: { x: number; y: number }[] = []

  for (let x = 8; x < width - 8; x += 4) {
    let bestY = fallbackY
    let accepted = false

    if (topRegion) {
      // Lowest strong edge in upper band ≈ wall top under ceiling.
      for (let y = yStart; y <= yEnd; y++) {
        const gy = gyRaw[y * width + x]
        if (gy >= gradThreshold && y >= bestY) {
          bestY = y
          accepted = true
        }
      }
    } else {
      // Uppermost strong edge in mid-lower band ≈ wall–floor junction (not floor grain below).
      for (let y = yStart; y <= yEnd; y++) {
        const gy = gyRaw[y * width + x]
        if (gy >= gradThreshold) {
          bestY = y
          accepted = true
          break
        }
      }
      if (!accepted) {
        let bestGy = -1
        for (let y = yStart; y <= yEnd; y++) {
          const gy = gyRaw[y * width + x]
          if (gy > bestGy) {
            bestGy = gy
            bestY = y
            accepted = bestGy > 0
          }
        }
      }
    }

    if (accepted) points.push({ x, y: bestY })
  }

  let line = fitSlopedLine(points, fallbackY)

  // Sub-pixel refinement on intercept via local Gy search
  let bestIntercept = line.intercept
  let bestScore = -1
  for (let d = -SUBPIXEL_SEARCH_PX; d <= SUBPIXEL_SEARCH_PX; d += SUBPIXEL_STEP) {
    let score = 0
    for (const p of points) {
      const expectedY = line.slope * p.x + line.intercept + d
      const yi = Math.round(Math.max(1, Math.min(height - 2, expectedY)))
      score += gyRaw[yi * width + p.x]
    }
    if (score > bestScore) {
      bestScore = score
      bestIntercept = line.intercept + d
    }
  }

  return { slope: line.slope, intercept: bestIntercept }
}

/** Keep only structural corner lines — drop interior false positives (light bands, window mullions). */
function pruneVerticalLines(
  verticalLines: number[],
  columnStrength: Float32Array,
  width: number
): number[] {
  if (verticalLines.length <= 2) return verticalLines

  const maxStr = Math.max(...verticalLines.map((x) => columnStrength[x]), 1)
  const leftZone = verticalLines.filter((x) => x < width * 0.42)
  const rightZone = verticalLines.filter((x) => x > width * 0.58)

  const strongest = (lines: number[]): number | null => {
    if (lines.length === 0) return null
    return lines.reduce((best, x) => (columnStrength[x] > columnStrength[best] ? x : best))
  }

  const result: number[] = []
  const left = strongest(leftZone)
  const right = strongest(rightZone)
  if (left !== null && columnStrength[left] >= maxStr * 0.48) result.push(left)
  if (right !== null && columnStrength[right] >= maxStr * 0.48) result.push(right)
  return result.sort((a, b) => a - b)
}

/** Corner snapping: nudge horizontal lines to meet vertical boundaries cleanly. */
function snapCorners(verticalLines: number[], topLine: SlopedLine, bottomLine: SlopedLine): void {
  if (verticalLines.length === 0) return

  let topInterceptSum = topLine.intercept
  let bottomInterceptSum = bottomLine.intercept

  for (const x of verticalLines) {
    topInterceptSum += slopedY(topLine, x) - topLine.slope * x
    bottomInterceptSum += slopedY(bottomLine, x) - bottomLine.slope * x
  }

  const n = verticalLines.length + 1
  topLine.intercept = topInterceptSum / n
  bottomLine.intercept = bottomInterceptSum / n
}

// ─── Part A: detectWallBoundaries ───────────────────────────────────────────

export function detectWallBoundaries(imageData: ImageData): WallBoundaries {
  const { data, width, height } = imageData
  const { L, A, B } = buildLabPlanes(data, width, height)
  const { gxRaw, gyRaw, magRaw, edgeMap } = buildSobelMaps(L, width, height)
  const columnStrength = computeColumnStrength(gxRaw, width, height)

  const { verticalLines: rawVerticalLines, rightZoneMaxStrength, maxStrength } = pickVerticalLines(
    columnStrength,
    gxRaw,
    magRaw,
    L,
    A,
    B,
    width,
    height
  )
  const verticalLines = ensureCornerVerticalLines(
    pruneVerticalLines(rawVerticalLines, columnStrength, width),
    columnStrength,
    width
  )
  console.log(
    'Vertical lines:',
    verticalLines,
    'rightZoneMaxStrength:',
    rightZoneMaxStrength,
    'globalMaxStrength:',
    maxStrength
  )
  const structuralLines = verticalLines.filter((x) => columnStrength[x] >= maxStrength * 0.48)
  const filteredVerticalLines = structuralLines.length > 0 ? structuralLines : verticalLines

  const topGrad = gradientThreshold(magRaw)
  let topLine = detectSlopedHorizontalLine(gyRaw, width, height, true, topGrad)
  let bottomLine = detectSlopedHorizontalLine(gyRaw, width, height, false, topGrad * 0.45)

  if (filteredVerticalLines.length > 0) {
    snapCorners(filteredVerticalLines, topLine, bottomLine)
  }

  // Ensure top is above bottom across the image
  const midX = width / 2
  if (slopedY(topLine, midX) >= slopedY(bottomLine, midX)) {
    bottomLine.intercept = slopedY(topLine, midX) + height * 0.4
  }

  return { width, height, verticalLines: filteredVerticalLines, topLine, bottomLine, edgeMap, columnStrength }
}

// ─── Part B: geometric quadrilateral mask ─────────────────────────────────────

function getWallZone(clickX: number, width: number, verticalLines: number[]): { left: number; right: number } {
  const dividers = [0, ...verticalLines, width - 1]
  for (let i = 0; i < dividers.length - 1; i++) {
    if (clickX >= dividers[i] && clickX <= dividers[i + 1]) {
      return { left: dividers[i], right: dividers[i + 1] }
    }
  }
  return { left: 0, right: width - 1 }
}

function clickInsideZone(
  clickX: number,
  clickY: number,
  left: number,
  right: number,
  topLine: SlopedLine,
  bottomLine: SlopedLine,
  inset: number
): boolean {
  if (clickX < left + inset || clickX > right - inset) return false
  const yTop = slopedY(topLine, clickX) + inset
  const yBot = slopedY(bottomLine, clickX) - inset
  return clickY >= yTop && clickY <= yBot
}

/** Intersection of vertical divider x = vx with a sloped horizontal boundary line. */
function intersectVerticalWithSlopedLine(
  verticalX: number,
  line: SlopedLine
): { x: number; y: number } {
  return { x: verticalX, y: slopedY(line, verticalX) }
}

/** Intersection of two sloped lines (shared corner when adjacent walls use different horizontals). */
function intersectSlopedLines(lineA: SlopedLine, lineB: SlopedLine): { x: number; y: number } | null {
  const denom = lineA.slope - lineB.slope
  if (Math.abs(denom) < 1e-9) return null
  const x = (lineB.intercept - lineA.intercept) / denom
  return { x, y: slopedY(lineA, x) }
}

/** Exact quad corners = vertical divider ∩ top/bottom boundary lines (shared by adjacent zones). */
export function computeWallQuadCorners(
  topLine: SlopedLine,
  bottomLine: SlopedLine,
  left: number,
  right: number
): WallCornerPoints {
  return {
    topLeft: intersectVerticalWithSlopedLine(left, topLine),
    topRight: intersectVerticalWithSlopedLine(right, topLine),
    bottomLeft: intersectVerticalWithSlopedLine(left, bottomLine),
    bottomRight: intersectVerticalWithSlopedLine(right, bottomLine),
  }
}

function interpolateEdgeY(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  x: number
): number {
  const dx = p1.x - p0.x
  if (Math.abs(dx) < 1e-6) return p0.y
  const t = (x - p0.x) / dx
  return p0.y + t * (p1.y - p0.y)
}

/** Part B: clip mask — solid fill inside the wall quadrilateral using exact corner points. */
function buildGeometricClipMask(
  boundaries: WallBoundaries,
  left: number,
  right: number
): Uint8ClampedArray {
  const { width, height, topLine, bottomLine } = boundaries
  const corners = computeWallQuadCorners(topLine, bottomLine, left, right)
  return buildGeometricClipMaskFromCorners(corners, width, height)
}

function buildGeometricClipMaskFromCorners(
  corners: WallCornerPoints,
  width: number,
  height: number
): Uint8ClampedArray {
  const clip = new Uint8ClampedArray(width * height)
  const x0 = Math.max(0, Math.floor(Math.min(corners.topLeft.x, corners.bottomLeft.x)))
  const x1 = Math.min(width - 1, Math.ceil(Math.max(corners.topRight.x, corners.bottomRight.x)))

  for (let x = x0; x <= x1; x++) {
    const yTop = interpolateEdgeY(corners.topLeft, corners.topRight, x)
    const yBot = interpolateEdgeY(corners.bottomLeft, corners.bottomRight, x)
    const yStart = Math.max(0, Math.ceil(Math.min(yTop, yBot)))
    const yEnd = Math.min(height - 1, Math.floor(Math.max(yTop, yBot)))
    for (let y = yStart; y <= yEnd; y++) {
      clip[y * width + x] = 255
    }
  }

  return clip
}

function countMaskPixels(mask: Uint8ClampedArray, threshold = 128): number {
  let count = 0
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > threshold) count++
  }
  return count
}

function sampleDominantWallLab(
  corners: WallCornerPoints,
  L: Float32Array,
  A: Float32Array,
  B: Float32Array,
  width: number,
  height: number
): [number, number, number] | null {
  const left = Math.min(corners.topLeft.x, corners.bottomLeft.x)
  const right = Math.max(corners.topRight.x, corners.bottomRight.x)
  const insetX = (right - left) * WALL_COLOR_SAMPLE_INSET_RATIO
  const sx0 = Math.max(0, Math.ceil(left + insetX))
  const sx1 = Math.min(width - 1, Math.floor(right - insetX))
  if (sx1 <= sx0) return null

  const lVals: number[] = []
  const aVals: number[] = []
  const bVals: number[] = []

  for (let x = sx0; x <= sx1; x++) {
    const yTop = interpolateEdgeY(corners.topLeft, corners.topRight, x)
    const yBot = interpolateEdgeY(corners.bottomLeft, corners.bottomRight, x)
    const yLo = Math.min(yTop, yBot)
    const yHi = Math.max(yTop, yBot)
    const insetY = (yHi - yLo) * WALL_COLOR_SAMPLE_INSET_RATIO
    const sy0 = Math.max(0, Math.ceil(yLo + insetY))
    const sy1 = Math.min(height - 1, Math.floor(yHi - insetY))
    for (let y = sy0; y <= sy1; y++) {
      const idx = y * width + x
      lVals.push(L[idx])
      aVals.push(A[idx])
      bVals.push(B[idx])
    }
  }

  if (lVals.length < 8) return null
  return [medianOf(lVals), medianOf(aVals), medianOf(bVals)]
}

function dilateBinary(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  const out = new Uint8Array(src.length)
  const r = Math.max(1, radius)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (src[idx] === 0) continue
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          out[ny * width + nx] = 1
        }
      }
    }
  }
  return out
}

function erodeBinary(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  const out = new Uint8Array(src.length)
  const r = Math.max(1, radius)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (src[idx] === 0) continue
      let keep = true
      for (let dy = -r; dy <= r && keep; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || src[ny * width + nx] === 0) {
            keep = false
            break
          }
        }
      }
      if (keep) out[idx] = 1
    }
  }
  return out
}

function morphCloseBinary(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  return erodeBinary(dilateBinary(src, width, height, radius), width, height, radius)
}

function removeSmallBinaryRegions(
  buf: Uint8Array,
  width: number,
  height: number,
  minArea: number
): void {
  const visited = new Uint8Array(buf.length)
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0 || visited[i]) continue
    const component: number[] = []
    const stack = [i]
    visited[i] = 1
    while (stack.length > 0) {
      const idx = stack.pop()!
      component.push(idx)
      const x = idx % width
      const y = (idx / width) | 0
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const ni = ny * width + nx
        if (buf[ni] && !visited[ni]) {
          visited[ni] = 1
          stack.push(ni)
        }
      }
    }
    if (component.length < minArea) {
      for (const idx of component) buf[idx] = 0
    }
  }
}

function localMeanEdge(
  edgeMap: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number
): number {
  let sum = 0
  let count = 0
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      sum += edgeMap[ny * width + nx]
      count++
    }
  }
  return count > 0 ? sum / count : 0
}

interface ObjectExclusionResult {
  excludedMask: Uint8ClampedArray
  applied: boolean
}

/**
 * Secondary pass: exclude non-wall objects via LAB delta-E, chroma, and local edge density.
 */
function applyObjectExclusion(
  mask: Uint8ClampedArray,
  corners: WallCornerPoints,
  L: Float32Array,
  A: Float32Array,
  B: Float32Array,
  edgeMap: Uint8Array,
  width: number,
  height: number,
  accumulateInto?: Uint8ClampedArray
): ObjectExclusionResult {
  const empty = new Uint8ClampedArray(width * height)
  const quadArea = countMaskPixels(mask)
  if (quadArea < 50) return { excludedMask: empty, applied: false }

  const dominant = sampleDominantWallLab(corners, L, A, B, width, height)
  if (!dominant) return { excludedMask: empty, applied: false }

  const [L0, A0, B0] = dominant
  const rawExclusion = new Uint8Array(width * height)

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] <= 128) continue
    const x = i % width
    const y = (i / width) | 0
    const dE = weightedDeltaE(L[i], A[i], B[i], L0, A0, B0)
    const dA = (A[i] - A0) * CHROMA_WEIGHT
    const dB = (B[i] - B0) * CHROMA_WEIGHT
    const chromaDist = Math.sqrt(dA * dA + dB * dB)
    const edgeDensity = localMeanEdge(edgeMap, width, height, x, y, EDGE_DENSITY_RADIUS)
    if (
      dE > EXCLUSION_DELTA_E ||
      chromaDist > CHROMA_EXCLUDE_DELTA ||
      edgeDensity > EDGE_DENSITY_THRESHOLD
    ) {
      rawExclusion[i] = 1
    }
  }

  const closed = morphCloseBinary(rawExclusion, width, height, EXCLUSION_MORPH_RADIUS)
  removeSmallBinaryRegions(closed, width, height, EXCLUSION_MIN_HOLE_AREA)

  let excludedCount = 0
  for (let i = 0; i < closed.length; i++) {
    if (closed[i]) excludedCount++
  }

  if (excludedCount / quadArea > EXCLUSION_MAX_REMOVED_RATIO) {
    console.warn(
      `[wall-mask] Object exclusion skipped: would remove ${((100 * excludedCount) / quadArea).toFixed(1)}% of quad ` +
        `(>${EXCLUSION_MAX_REMOVED_RATIO * 100}% threshold). Dominant wall color sample may be wrong.`
    )
    return { excludedMask: accumulateInto ?? empty, applied: false }
  }

  const excludedMask = accumulateInto ?? new Uint8ClampedArray(width * height)
  for (let i = 0; i < mask.length; i++) {
    if (closed[i]) {
      excludedMask[i] = 255
      mask[i] = 0
    }
  }

  return { excludedMask, applied: true }
}

/** Remove paint from high-texture columns at zone edges (curtain folds bleeding past divider). */
function excludeEdgeColumnLeaks(
  mask: Uint8ClampedArray,
  excludedMask: Uint8ClampedArray,
  zoneLeft: number,
  zoneRight: number,
  topLine: SlopedLine,
  bottomLine: SlopedLine,
  edgeMap: Uint8Array,
  width: number,
  height: number
): void {
  const strip = Math.max(6, Math.floor((zoneRight - zoneLeft) * 0.06))
  for (let x = zoneLeft; x <= Math.min(zoneRight, zoneLeft + strip); x++) {
    let edgeSum = 0
    let count = 0
    const yTop = Math.max(0, Math.ceil(slopedY(topLine, x)))
    const yBot = Math.min(height - 1, Math.floor(slopedY(bottomLine, x)))
    for (let y = yTop; y <= yBot; y++) {
      edgeSum += edgeMap[y * width + x]
      count++
    }
    if (count === 0 || edgeSum / count < EDGE_DENSITY_THRESHOLD * 0.75) continue
    for (let y = yTop; y <= yBot; y++) {
      const idx = y * width + x
      if (mask[idx] > 128) {
        mask[idx] = 0
        excludedMask[idx] = 255
      }
    }
  }
}

/** 1–2 px feathered edge: partial alpha at mask boundaries for natural paint compositing. */
function featherMaskEdges(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  radiusPx: number
): void {
  const r = Math.max(1, radiusPx)
  const src = new Uint8ClampedArray(mask)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (src[idx] <= 128) {
        mask[idx] = 0
        continue
      }

      let minDist = r + 1
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || src[ny * width + nx] > 128) continue
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < minDist) minDist = dist
        }
      }

      if (minDist <= r) {
        const t = minDist / r
        mask[idx] = Math.round(255 * t)
      } else {
        mask[idx] = 255
      }
    }
  }
}

function intersectMaskWithClip(mask: Uint8ClampedArray, clip: Uint8ClampedArray): void {
  for (let i = 0; i < mask.length; i++) {
    if (clip[i] <= 128) mask[i] = 0
  }
}

/**
 * Remove curtains/windows inside the wall zone — chroma-only so backlight
 * on the same wall does not punch holes in the fill.
 */
function applyChromaExclusion(
  mask: Uint8ClampedArray,
  A: Float32Array,
  B: Float32Array,
  startX: number,
  startY: number,
  width: number,
  height: number,
  chromaThreshold: number
): void {
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return
  const startIdx = startY * width + startX
  const A0 = A[startIdx]
  const B0 = B[startIdx]

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] <= 128) continue
    const dA = (A[i] - A0) * CHROMA_WEIGHT
    const dB = (B[i] - B0) * CHROMA_WEIGHT
    if (Math.sqrt(dA * dA + dB * dB) > chromaThreshold) mask[i] = 0
  }
}

function getExpandedWallZone(clickX: number, width: number, verticalLines: number[]): { left: number; right: number } {
  if (verticalLines.length === 0) return { left: 0, right: width - 1 }

  const sorted = [...verticalLines].sort((a, b) => a - b)
  const zone = getWallZone(clickX, width, sorted)

  // If a spurious interior line split the zone too narrow, span outermost dividers.
  if (zone.right - zone.left < width * 0.28) {
    const leftOfClick = sorted.filter((x) => x <= clickX)
    const rightOfClick = sorted.filter((x) => x >= clickX)
    return {
      left: leftOfClick.length > 0 ? leftOfClick[0] : 0,
      right: rightOfClick.length > 0 ? rightOfClick[rightOfClick.length - 1] : width - 1,
    }
  }

  return zone
}

/** Part B: fill every pixel inside the wall quadrilateral, with object exclusion + feathered edges. */
export function buildWallMask(
  boundaries: WallBoundaries,
  clickX: number,
  clickY: number,
  lab?: { L: Float32Array; A: Float32Array; B: Float32Array }
): WallMaskResult | null {
  const { width, height, topLine, bottomLine } = boundaries
  const { left, right } = getWallZoneForClick(clickX, boundaries)

  if (right - left > width * 0.85) {
    return null
  }

  if (!clickInsideZone(clickX, clickY, left, right, topLine, bottomLine, INSET_PX)) {
    return null
  }

  const corners = computeWallQuadCorners(topLine, bottomLine, left, right)
  const mask = buildGeometricClipMaskFromCorners(corners, width, height)

  if (countMaskPixels(mask) < 50) return null

  let excludedMask: Uint8ClampedArray = new Uint8ClampedArray(width * height)
  if (lab) {
    const exclusion = applyObjectExclusion(
      mask,
      corners,
      lab.L,
      lab.A,
      lab.B,
      boundaries.edgeMap,
      width,
      height
    )
    excludedMask = new Uint8ClampedArray(exclusion.excludedMask)
  }

  featherMaskEdges(mask, width, height, MASK_FEATHER_RADIUS)

  return { mask, method: 'geometric', zoneLeft: left, zoneRight: right, excludedMask, quadCorners: corners }
}

// ─── Part D: LAB BFS fallback ───────────────────────────────────────────────

function buildEdgeMap(L: Float32Array, width: number, height: number): Uint8Array {
  const { edgeMap } = buildSobelMaps(L, width, height)
  return edgeMap
}

interface ZoneClip {
  left: number
  right: number
  topLine: SlopedLine
  bottomLine: SlopedLine
}

function insideZoneClip(x: number, y: number, clip: ZoneClip, inset: number): boolean {
  if (x < clip.left + inset || x > clip.right - inset) return false
  const yTop = slopedY(clip.topLine, x) + inset
  const yBot = slopedY(clip.bottomLine, x) - inset
  return y >= yTop && y <= yBot
}

function labRegionGrow(
  L: Float32Array,
  A: Float32Array,
  B: Float32Array,
  edgeMap: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  deltaETolerance: number,
  edgeBlockThreshold: number,
  zoneClip?: ZoneClip
): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(width * height)
  const visited = new Uint8Array(width * height)
  const startIdx = startY * width + startX
  const L0 = L[startIdx]
  const A0 = A[startIdx]
  const B0 = B[startIdx]

  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  queue[tail++] = startIdx
  visited[startIdx] = 1
  mask[startIdx] = 255

  function tryEnqueue(nIdx: number) {
    if (visited[nIdx]) return
    visited[nIdx] = 1
    const x = nIdx % width
    const y = (nIdx / width) | 0
    if (zoneClip && !insideZoneClip(x, y, zoneClip, ZONE_BOUNDARY_INSET)) return
    if (edgeMap[nIdx] > edgeBlockThreshold) return
    const dL = (L[nIdx] - L0) * L_WEIGHT
    const dA = (A[nIdx] - A0) * CHROMA_WEIGHT
    const dB = (B[nIdx] - B0) * CHROMA_WEIGHT
    if (Math.sqrt(dL * dL + dA * dA + dB * dB) >= deltaETolerance) return
    mask[nIdx] = 255
    queue[tail++] = nIdx
  }

  while (head < tail) {
    const idx = queue[head++]
    const x = idx % width
    const y = (idx / width) | 0

    if (x > 0) tryEnqueue(idx - 1)
    if (x < width - 1) tryEnqueue(idx + 1)
    if (y > 0) tryEnqueue(idx - width)
    if (y < height - 1) tryEnqueue(idx + width)
  }

  return mask
}

function fillHolesFallback(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  blocked?: Uint8ClampedArray
): void {
  const pending = new Uint8Array(width * height)
  for (let pass = 0; pass < FALLBACK_HOLE_FILL_PASSES; pass++) {
    pending.fill(0)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        if (mask[idx] > 128) continue
        if (blocked && blocked[idx] > 128) continue
        let inCount = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
            const ni = ny * width + nx
            if (blocked && blocked[ni] > 128) continue
            if (mask[ni] > 128) inCount++
          }
        }
        if (inCount >= FALLBACK_HOLE_FILL_NEIGHBORS) pending[idx] = 1
      }
    }
    for (let i = 0; i < mask.length; i++) {
      if (pending[i]) mask[i] = 255
    }
  }
}

function isMaskBoundaryPixel(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  idx: number
): boolean {
  if (mask[idx] <= 128) return false
  const x = idx % width
  const y = (idx / width) | 0
  if (x > 0 && mask[idx - 1] <= 128) return true
  if (x < width - 1 && mask[idx + 1] <= 128) return true
  if (y > 0 && mask[idx - width] <= 128) return true
  if (y < height - 1 && mask[idx + width] <= 128) return true
  return false
}

function edgeOutlineThreshold(edgeMap: Uint8Array): number {
  const samples: number[] = []
  for (let i = 0; i < edgeMap.length; i++) {
    if (edgeMap[i] > 0) samples.push(edgeMap[i])
  }
  if (samples.length === 0) return 255
  samples.sort((a, b) => a - b)
  const idx = Math.floor(samples.length * DEBUG_EDGE_TOP_PERCENT)
  return samples[Math.min(idx, samples.length - 1)]
}

/** Keep only ridge pixels so edges render as crisp 1 px red lines, not a soft heatmap. */
function isThinStrongEdge(
  edgeMap: Uint8Array,
  width: number,
  height: number,
  idx: number,
  threshold: number
): boolean {
  const e = edgeMap[idx]
  if (e < threshold) return false

  const x = idx % width
  const y = (idx / width) | 0
  if (x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1) return true

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      if (edgeMap[(y + dy) * width + (x + dx)] > e) return false
    }
  }
  return true
}

export interface FloodFillDebugOverlay {
  edgeMap: Uint8Array
  mask: Uint8ClampedArray
  imageData: ImageData
}

export interface EdgeDebugOptions {
  /** Existing wall mask — green boundary drawn when set. */
  mask?: Uint8ClampedArray | null
  /** Pixels excluded from paint (windows, curtains) — drawn blue when set. */
  excludedMask?: Uint8ClampedArray | null
  /** Recompute mask from click (uses hybrid clip when boundaries supplied). */
  clickX?: number
  clickY?: number
  boundaries?: WallBoundaries
}

/** Debug overlay: photo + red edges + green boundary + blue excluded regions. */
export function buildEdgeDebugOverlay(
  imageData: ImageData,
  options: EdgeDebugOptions = {}
): FloodFillDebugOverlay {
  const { data, width, height } = imageData
  const { L } = buildLabPlanes(data, width, height)
  const edgeMap = buildEdgeMap(L, width, height)
  const threshold = edgeOutlineThreshold(edgeMap)

  let mask: Uint8ClampedArray | null = options.mask ?? null
  let excludedMask: Uint8ClampedArray | null = options.excludedMask ?? null
  if (
    !mask &&
    options.clickX !== undefined &&
    options.clickY !== undefined &&
    options.clickX >= 0 &&
    options.clickY >= 0
  ) {
    const result = computeWallMask(
      imageData,
      options.clickX,
      options.clickY,
      options.boundaries ?? detectWallBoundaries(imageData)
    )
    mask = result.mask
    excludedMask = result.excludedMask ?? null
  }

  const emptyMask = new Uint8ClampedArray(width * height)
  const overlay = new ImageData(width, height)
  const out = overlay.data

  for (let i = 0; i < width * height; i++) {
    const pi = i * 4
    out[pi] = data[pi]
    out[pi + 1] = data[pi + 1]
    out[pi + 2] = data[pi + 2]
    out[pi + 3] = 255

    if (isThinStrongEdge(edgeMap, width, height, i, threshold)) {
      out[pi] = 255
      out[pi + 1] = 48
      out[pi + 2] = 48
    }

    if (excludedMask && excludedMask[i] > 128) {
      out[pi] = 48
      out[pi + 1] = 120
      out[pi + 2] = 255
    }

    if (mask && isMaskBoundaryPixel(mask, width, height, i)) {
      out[pi] = 24
      out[pi + 1] = 255
      out[pi + 2] = 72
    }
  }

  return { edgeMap, mask: mask ?? emptyMask, imageData: overlay }
}

/** Alias for buildEdgeDebugOverlay — mask debug with red/green/blue layers. */
export const renderMaskDebugOverlay = buildEdgeDebugOverlay

/** @deprecated Use buildEdgeDebugOverlay — kept for callers expecting flood-fill debug. */
export function buildFloodFillDebugOverlay(
  imageData: ImageData,
  startX: number,
  startY: number,
  _deltaETolerance: number = FALLBACK_DELTA_E,
  _edgeBlockThreshold: number = FALLBACK_EDGE_BLOCK
): FloodFillDebugOverlay {
  const boundaries = detectWallBoundaries(imageData)
  return buildEdgeDebugOverlay(imageData, {
    clickX: startX,
    clickY: startY,
    boundaries,
  })
}

/** Draw debug overlay onto a 2D canvas context (same dimensions as source image). */
export function drawEdgeDebugOverlay(
  ctx: CanvasRenderingContext2D,
  imageData: ImageData,
  options: EdgeDebugOptions = {}
): FloodFillDebugOverlay {
  const debug = buildEdgeDebugOverlay(imageData, options)
  ctx.putImageData(debug.imageData, 0, 0)
  return debug
}

/** Alias for drawEdgeDebugOverlay. */
export const drawMaskDebugOverlay = drawEdgeDebugOverlay

/** Draw debug overlay onto a 2D canvas context (same dimensions as source image). */
export function drawFloodFillDebugOverlay(
  ctx: CanvasRenderingContext2D,
  imageData: ImageData,
  startX: number,
  startY: number,
  deltaETolerance: number = FALLBACK_DELTA_E,
  edgeBlockThreshold: number = FALLBACK_EDGE_BLOCK
): FloodFillDebugOverlay {
  const boundaries = detectWallBoundaries(imageData)
  return drawEdgeDebugOverlay(ctx, imageData, {
    clickX: startX,
    clickY: startY,
    boundaries,
  })
}

/** Part D fallback — LAB BFS when geometric detection fails. */
export function floodFillMask(
  imageData: ImageData,
  startX: number,
  startY: number,
  deltaETolerance: number = FALLBACK_DELTA_E,
  edgeBlockThreshold: number = FALLBACK_EDGE_BLOCK
): Uint8ClampedArray {
  const { data, width, height } = imageData
  const empty = new Uint8ClampedArray(width * height)
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return empty

  const { L, A, B } = buildLabPlanes(data, width, height)
  const edgeMap = buildEdgeMap(L, width, height)
  const mask = labRegionGrow(L, A, B, edgeMap, width, height, startX, startY, deltaETolerance, edgeBlockThreshold)
  fillHolesFallback(mask, width, height)
  return mask
}

/** Main entry: geometric quad ∩ edge-blocked flood fill, plus object exclusion. */
export function computeWallMask(
  imageData: ImageData,
  clickX: number,
  clickY: number,
  boundaries: WallBoundaries
): WallMaskResult {
  const { data, width, height } = imageData
  const quad = buildWallQuadForClick(imageData, clickX, clickY, boundaries)
  const { left, right } = quad

  const { L, A, B } = buildLabPlanes(data, width, height)
  const { gyRaw, magRaw } = buildSobelMaps(L, width, height)
  const topGrad = gradientThreshold(magRaw)
  const snapped = buildEdgeSnappedClipMask(left, right, gyRaw, width, height, topGrad)
  const geomMask = snapped.mask
  const corners = computeWallQuadCorners(snapped.topLine, snapped.bottomLine, left, right)
  const zoneClip: ZoneClip = {
    left,
    right,
    topLine: snapped.topLine,
    bottomLine: snapped.bottomLine,
  }

  const floodMask = labRegionGrow(
    L,
    A,
    B,
    boundaries.edgeMap,
    width,
    height,
    clickX,
    clickY,
    FALLBACK_DELTA_E,
    FALLBACK_EDGE_BLOCK,
    zoneClip
  )

  const mask = new Uint8ClampedArray(width * height)
  const excludedMask = new Uint8ClampedArray(width * height)

  for (let i = 0; i < mask.length; i++) {
    if (geomMask[i] <= 128) continue
    if (floodMask[i] > 128) {
      mask[i] = 255
    } else {
      excludedMask[i] = 255
    }
  }

  applyObjectExclusion(mask, corners, L, A, B, boundaries.edgeMap, width, height, excludedMask)
  excludeEdgeColumnLeaks(
    mask,
    excludedMask,
    quad.left,
    quad.right,
    quad.topLine,
    quad.bottomLine,
    boundaries.edgeMap,
    width,
    height
  )

  fillHolesFallback(mask, width, height, excludedMask)
  featherMaskEdges(mask, width, height, MASK_FEATHER_RADIUS)

  return {
    mask,
    method: 'hybrid',
    zoneLeft: quad.left,
    zoneRight: quad.right,
    excludedMask,
    quadCorners: corners,
  }
}

/** Part C helper: draw subtle corner shadow along boundary-adjacent mask edges. */
export function buildCornerShadowLayer(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  zoneLeft: number,
  zoneRight: number,
  topLine: SlopedLine,
  bottomLine: SlopedLine,
  luminanceData: ImageData
): Uint8ClampedArray {
  const shadow = new Uint8ClampedArray(width * height)
  const lum = luminanceData.data

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      if (mask[idx] <= 128) continue

      const onBoundary =
        Math.abs(x - zoneLeft) <= 2 ||
        Math.abs(x - zoneRight) <= 2 ||
        Math.abs(y - slopedY(topLine, x)) <= 2 ||
        Math.abs(y - slopedY(bottomLine, x)) <= 2

      if (!onBoundary) continue

      // Only edge pixels of the mask
      const isEdge =
        mask[idx - 1] <= 128 ||
        mask[idx + 1] <= 128 ||
        mask[idx - width] <= 128 ||
        mask[idx + width] <= 128

      if (isEdge) {
        const li = idx * 4
        const darkness = 255 - Math.round(0.299 * lum[li] + 0.587 * lum[li + 1] + 0.114 * lum[li + 2])
        shadow[idx] = Math.min(255, darkness)
      }
    }
  }

  return shadow
}
