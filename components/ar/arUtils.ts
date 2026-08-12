/**
 * AR Utilities
 * Helper functions for WebXR and AR functionality
 */

/**
 * Check if WebXR AR is supported
 */
export async function isWebXRSupported(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.xr) {
    return false
  }

  try {
    // Check if AR session is supported
    const supported = await navigator.xr.isSessionSupported('immersive-ar')
    return supported
  } catch (error) {
    console.warn('WebXR AR check failed:', error)
    return false
  }
}

/**
 * Check if device has camera access
 */
export async function hasCameraAccess(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    stream.getTracks().forEach(track => track.stop())
    return true
  } catch (error) {
    console.warn('Camera access check failed:', error)
    return false
  }
}

/**
 * Request camera permissions
 */
export async function requestCameraPermission(): Promise<MediaStream | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment', // Use back camera on mobile
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })
    return stream
  } catch (error) {
    console.error('Camera permission denied:', error)
    return null
  }
}

/**
 * Get device type
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  )
}

/**
 * Check if browser supports required features
 */
export function checkBrowserSupport(): {
  webxr: boolean
  camera: boolean
  canvas: boolean
  threejs: boolean
} {
  return {
    webxr: typeof navigator !== 'undefined' && 'xr' in navigator,
    camera: typeof navigator !== 'undefined' && 'mediaDevices' in navigator,
    canvas: typeof HTMLCanvasElement !== 'undefined',
    threejs: typeof window !== 'undefined' && 'THREE' in window,
  }
}
