/**
 * Paint Overlay Utilities
 * Helper functions for paint color manipulation and conversion
 */

/**
 * Extract color suggestions from design results text
 * This is a simple parser - in future, AI can provide structured color data
 */
export function extractColorsFromText(text: string): string[] {
  const colors: string[] = []

  // Common paint color patterns
  const colorPatterns = [
    /#[0-9A-Fa-f]{6}/g, // Hex colors
    /rgb\([^)]+\)/g, // RGB colors
    /rgba\([^)]+\)/g, // RGBA colors
  ]

  colorPatterns.forEach(pattern => {
    const matches = text.match(pattern)
    if (matches) {
      colors.push(...matches)
    }
  })

  // Default colors if none found
  if (colors.length === 0) {
    return [
      '#F5E6D3', // Warm Beige
      '#C9A982', // Terracotta
      '#8B7355', // Sage Green
      '#E8D5C4', // Cream
      '#D4A574', // Warm Brown
    ]
  }

  return colors.slice(0, 5) // Limit to 5 colors
}

/**
 * Convert hex color to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    }
    : null
}

/**
 * Convert RGB to hex
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')
}

/**
 * Default paint colors for Indian homes
 */
export const DEFAULT_PAINT_COLORS = [
  { name: 'Creamy Beige', hex: '#E8E6E1' },
  { name: 'Warm Sand', hex: '#D4C2A8' },
  { name: 'Soft Sage', hex: '#94A38C' },
  { name: 'Terracotta Clay', hex: '#C17C74' },
  { name: 'Morning Mist', hex: '#D1D5D8' },
  { name: 'Evening Blush', hex: '#DAC4C2' },
  { name: 'Cozy Taupe', hex: '#A89F91' },
  { name: 'Charcoal Luxe', hex: '#363636' },
  { name: 'Classic White', hex: '#FFFFFF' },
]
