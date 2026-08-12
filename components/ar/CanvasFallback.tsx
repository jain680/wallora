'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import {
  computeWallMask,
  detectWallBoundaries,
  drawEdgeDebugOverlay,
  MAX_MASK_DIMENSION,
} from '@/utils/floodFillMask'

interface CanvasFallbackProps {
  imageUrl: string
  paintColor: string
  opacity: number
  showAccentWall: boolean
  activeMaterial?: 'matte' | 'silk' | 'velvet' | 'metallic' | 'marble' | 'concrete'
  activeWallpaper?: string | null
  timeOfDay?: number
  debugFloodFill?: boolean
}

interface MaskImageData {
  data: ImageData
  width: number
  height: number
}

interface PaintedWall {
  id: string
  zoneLeft: number
  zoneRight: number
  mask: Uint8ClampedArray
  excludedMask: Uint8ClampedArray | null
  clickX: number
  clickY: number
}

function mergeWallMasks(walls: PaintedWall[], size: number): Uint8ClampedArray {
  const combined = new Uint8ClampedArray(size)
  for (const wall of walls) {
    for (let i = 0; i < size; i++) {
      combined[i] = Math.max(combined[i], wall.mask[i])
    }
  }
  return combined
}

export default function CanvasFallback({
  imageUrl,
  paintColor,
  opacity,
  showAccentWall,
  activeMaterial = 'matte',
  activeWallpaper = null,
  timeOfDay = 0.5,
  debugFloodFill = false,
}: CanvasFallbackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const maskRef = useRef<Uint8ClampedArray | null>(null)
  const excludedMaskRef = useRef<Uint8ClampedArray | null>(null)
  const paintedWallsRef = useRef<PaintedWall[]>([])
  const maskWidthRef = useRef(0)
  const maskHeightRef = useRef(0)
  const lastClickRef = useRef<{ x: number; y: number } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paintedWallCount, setPaintedWallCount] = useState(0)
  const [debugMode, setDebugMode] = useState(debugFloodFill)

  const clearAllWalls = useCallback(() => {
    paintedWallsRef.current = []
    maskRef.current = null
    excludedMaskRef.current = null
    lastClickRef.current = null
    setPaintedWallCount(0)
    setError(null)
  }, [])

  const getMaskImageData = useCallback(
    (img: HTMLImageElement, canvasW?: number, canvasH?: number): MaskImageData => {
      const baseW = canvasW ?? img.width
      const baseH = canvasH ?? img.height
      const scaleToMask = Math.min(MAX_MASK_DIMENSION / baseW, MAX_MASK_DIMENSION / baseH, 1)
      const maskW = Math.round(baseW * scaleToMask)
      const maskH = Math.round(baseH * scaleToMask)

      const downCanvas = document.createElement('canvas')
      downCanvas.width = maskW
      downCanvas.height = maskH
      const downCtx = downCanvas.getContext('2d')
      if (!downCtx) throw new Error('Could not create mask canvas context')
      downCtx.imageSmoothingEnabled = true
      downCtx.imageSmoothingQuality = 'high'
      downCtx.drawImage(img, 0, 0, maskW, maskH)
      return { data: downCtx.getImageData(0, 0, maskW, maskH), width: maskW, height: maskH }
    },
    []
  )

  const applyPaint = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const mask = maskRef.current
      if (!mask || !showAccentWall) return

      const mw = maskWidthRef.current
      const mh = maskHeightRef.current
      if (mw === 0 || mh === 0) return

      const paintCanvas = document.createElement('canvas')
      paintCanvas.width = width
      paintCanvas.height = height
      const paintCtx = paintCanvas.getContext('2d')
      if (!paintCtx) return

      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = mw
      maskCanvas.height = mh
      const maskCtx = maskCanvas.getContext('2d')
      if (!maskCtx) return

      const maskImageData = maskCtx.createImageData(mw, mh)
      for (let i = 0; i < mask.length; i++) {
        const v = mask[i]
        maskImageData.data[i * 4] = v
        maskImageData.data[i * 4 + 1] = v
        maskImageData.data[i * 4 + 2] = v
        maskImageData.data[i * 4 + 3] = v
      }
      maskCtx.putImageData(maskImageData, 0, 0)

      const scaledMask = document.createElement('canvas')
      scaledMask.width = width
      scaledMask.height = height
      const scaledCtx = scaledMask.getContext('2d')
      if (!scaledCtx) return
      scaledCtx.imageSmoothingEnabled = true
      scaledCtx.imageSmoothingQuality = 'high'
      scaledCtx.drawImage(maskCanvas, 0, 0, width, height)

      if (activeWallpaper) {
        const img = new Image()
        img.src = activeWallpaper
        img.onload = () => {
          const pattern = paintCtx.createPattern(img, 'repeat')
          if (pattern) {
            paintCtx.fillStyle = pattern
            paintCtx.fillRect(0, 0, width, height)
          }
          paintCtx.globalCompositeOperation = 'destination-in'
          paintCtx.drawImage(scaledMask, 0, 0, width, height)
          ctx.globalCompositeOperation = 'source-over'
          ctx.globalAlpha = opacity
          ctx.drawImage(paintCanvas, 0, 0)
          ctx.globalAlpha = 1
        }
        return
      }

      paintCtx.fillStyle = paintColor
      paintCtx.fillRect(0, 0, width, height)
      paintCtx.globalCompositeOperation = 'destination-in'
      paintCtx.drawImage(scaledMask, 0, 0, width, height)

      // Even, uniform paint inside the wall mask.
      ctx.globalCompositeOperation = 'multiply'
      ctx.globalAlpha = opacity * 0.9
      ctx.drawImage(paintCanvas, 0, 0)

      ctx.globalCompositeOperation = 'color'
      ctx.globalAlpha = opacity * 0.55
      ctx.drawImage(paintCanvas, 0, 0)

      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
    },
    [paintColor, opacity, showAccentWall, activeMaterial, activeWallpaper]
  )

  const renderDebugView = useCallback(() => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    if (maskRef.current && showAccentWall) {
      applyPaint(ctx, canvas.width, canvas.height)
    }

    const { data: maskImageData, width: maskW, height: maskH } = getMaskImageData(
      img,
      canvas.width,
      canvas.height
    )
    const debugCanvas = document.createElement('canvas')
    debugCanvas.width = maskW
    debugCanvas.height = maskH
    const debugCtx = debugCanvas.getContext('2d')
    if (!debugCtx) return

    const click = lastClickRef.current
    drawEdgeDebugOverlay(debugCtx, maskImageData, {
      mask: click ? maskRef.current : null,
      excludedMask: click ? excludedMaskRef.current : null,
      clickX: click?.x,
      clickY: click?.y,
      boundaries: click ? detectWallBoundaries(maskImageData) : undefined,
    })

    ctx.globalAlpha = 0.82
    ctx.drawImage(debugCanvas, 0, 0, canvas.width, canvas.height)
    ctx.globalAlpha = 1
  }, [getMaskImageData, applyPaint, showAccentWall])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img) return

    if (debugMode) {
      renderDebugView()
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const brightness = 0.5 + timeOfDay * 0.5
    if (brightness !== 1) {
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-over'
    }

    applyPaint(ctx, canvas.width, canvas.height)
  }, [applyPaint, timeOfDay, debugMode, renderDebugView])

  useEffect(() => {
    redraw()
  }, [redraw])

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = imageUrl
    img.onload = () => {
      imageRef.current = img
      clearAllWalls()
      const canvas = canvasRef.current
      if (!canvas) return

      const container = containerRef.current
      const maxW = container?.clientWidth ?? 800
      const maxH = container?.clientHeight ?? 600
      const scale = Math.min(maxW / img.width, maxH / img.height, 1)
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)

      redraw()
    }
    img.onerror = () => setError('Failed to load image')
  }, [imageUrl, redraw, clearAllWalls])

  const handleCanvasClick = useCallback(
    async (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      const img = imageRef.current
      if (!canvas || !img) return

      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      const clickX = Math.floor((e.clientX - rect.left) * scaleX)
      const clickY = Math.floor((e.clientY - rect.top) * scaleY)

      setIsLoading(true)
      setError(null)

      try {
        const { data: maskImageData, width: maskW, height: maskH } = getMaskImageData(
          img,
          canvas.width,
          canvas.height
        )
        const maskClickX = Math.floor(clickX * (maskW / canvas.width))
        const maskClickY = Math.floor(clickY * (maskH / canvas.height))

        const boundaries = detectWallBoundaries(maskImageData)
        const result = computeWallMask(maskImageData, maskClickX, maskClickY, boundaries)

        const wallId = `wall-${result.zoneLeft}-${result.zoneRight}`
        const painted: PaintedWall = {
          id: wallId,
          zoneLeft: result.zoneLeft,
          zoneRight: result.zoneRight,
          mask: result.mask,
          excludedMask: result.excludedMask ?? null,
          clickX: maskClickX,
          clickY: maskClickY,
        }

        const existingIdx = paintedWallsRef.current.findIndex((w) => w.id === wallId)
        if (existingIdx >= 0) {
          paintedWallsRef.current[existingIdx] = painted
        } else {
          paintedWallsRef.current.push(painted)
        }

        maskWidthRef.current = maskW
        maskHeightRef.current = maskH
        maskRef.current = mergeWallMasks(paintedWallsRef.current, maskW * maskH)
        excludedMaskRef.current = painted.excludedMask
        lastClickRef.current = { x: maskClickX, y: maskClickY }
        setPaintedWallCount(paintedWallsRef.current.length)

        redraw()
      } catch (err) {
        console.error('Wall segmentation error:', err)
        setError('Could not detect wall. Try clicking directly on the wall surface.')
      } finally {
        setIsLoading(false)
      }
    },
    [getMaskImageData, redraw]
  )

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center bg-stone-200">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="max-w-full max-h-full cursor-crosshair rounded-lg shadow-lg"
        style={{ touchAction: 'none' }}
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
          <div className="bg-white/90 px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin" />
            <span className="text-stone-700 font-medium">Detecting wall...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm max-w-xs text-center">
          {error}
        </div>
      )}

      {!paintedWallCount && !isLoading && !error && !debugMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full text-sm text-stone-600 shadow-sm pointer-events-none">
          Tap each wall separately to paint it
        </div>
      )}

      {paintedWallCount > 0 && (
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              clearAllWalls()
              redraw()
            }}
            className="bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs text-stone-600 shadow-sm hover:bg-white"
            title="Clear all painted walls"
          >
            Clear walls
          </button>
          {!debugMode && (
            <span className="bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs text-stone-600 shadow-sm pointer-events-none">
              {paintedWallCount} wall{paintedWallCount === 1 ? '' : 's'} painted
            </span>
          )}
        </div>
      )}

      {debugMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full text-xs text-stone-600 shadow-sm pointer-events-none">
          Red = edges · Green = paint boundary · Blue = excluded · Click each wall separately
        </div>
      )}

      <button
        type="button"
        onClick={() => setDebugMode((v) => !v)}
        className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs text-stone-600 shadow-sm hover:bg-white"
        title="Toggle edge debug overlay"
      >
        {debugMode ? 'Debug: ON' : 'Debug: OFF'}
      </button>
    </div>
  )
}
