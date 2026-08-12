'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { isWebXRSupported, hasCameraAccess, requestCameraPermission } from './arUtils'

interface UseARReturn {
  isSupported: boolean
  isInitializing: boolean
  isActive: boolean
  error: string | null
  xrSession: XRSession | null
  xrReferenceSpace: XRReferenceSpace | null // New: Reference space for AR objects
  startAR: () => Promise<void>
  stopAR: () => void
  cameraStream: MediaStream | null
}

/**
 * Custom hook for AR functionality
 * Manages WebXR AR session and camera access
 */
export function useAR(): UseARReturn {
  const [isSupported, setIsSupported] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [xrSession, setXrSession] = useState<XRSession | null>(null)
  const [xrReferenceSpace, setXrReferenceSpace] = useState<XRReferenceSpace | null>(null) // New: Reference space state
  const xrSessionRef = useRef<XRSession | null>(null)

  // Check WebXR support on mount
  useEffect(() => {
    const checkSupport = async () => {
      try {
        const webxrSupported = await isWebXRSupported()
        const cameraAvailable = await hasCameraAccess()
        setIsSupported(webxrSupported && cameraAvailable)
      } catch (err) {
        console.warn('AR support check failed:', err)
        setIsSupported(false)
      }
    }
    checkSupport()
  }, [])

  // Start AR session
  const startAR = useCallback(async () => {
    setIsInitializing(true)
    setError(null)

    try {
      console.log('Requesting camera permission...')
      const stream = await requestCameraPermission()
      if (!stream) {
        throw new Error('Camera permission denied. Please allow camera access.')
      }
      setCameraStream(stream)
      console.log('Camera permission granted')

      // Check WebXR support
      if (!navigator.xr) {
        throw new Error('WebXR not supported. Using fallback mode.')
      }

      // Check if immersive-ar is supported explicitly
      const isArSupported = await navigator.xr.isSessionSupported('immersive-ar')
      if (!isArSupported) {
        throw new Error('immersive-ar mode is not supported on this device')
      }

      console.log('Requesting AR session...')
      // Try simplest configuration first that works on most devices
      const sessionInit: XRSessionInit = {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['dom-overlay', 'hit-test'], // Removed light-estimation to be safe
      };

      // Only add domOverlay if supported/safe to request
      // (Some browsers error if you pass domOverlay with root: body)
      try {
        if (document.body) {
          sessionInit.domOverlay = { root: document.body };
        }
      } catch (e) {
        console.warn('Could not configure domOverlay:', e);
      }

      const session = await navigator.xr.requestSession('immersive-ar', sessionInit)
      console.log('AR session started successfully')

      xrSessionRef.current = session
      setXrSession(session)
      setIsActive(true)

      // Get the AR reference space for placing objects
      const refSpace = await session.requestReferenceSpace('local-floor');
      setXrReferenceSpace(refSpace);

      // Handle session end
      session.addEventListener('end', () => {
        console.log('AR session ended')
        setIsActive(false)
        xrSessionRef.current = null
        setXrSession(null)
        setXrReferenceSpace(null); // Clear reference space on end
        if (cameraStream) {
          cameraStream.getTracks().forEach(track => track.stop())
          setCameraStream(null)
        }
      })
    } catch (err: any) {
      console.error('Failed to start AR detailed error:', err)
      const errorMessage = err.message || 'Failed to start AR session'

      // Check for specific error types to give better feedback
      if (errorMessage.includes('not supported') || errorMessage.includes('AR Unavailable')) {
        // Don't show error message, just re-throw so page.tsx handles fallback
        setError(null)
        throw new Error('AR_UNSUPPORTED')
      } else if (errorMessage.includes('permission')) {
        setError('Camera permission denied. Please reset permissions for this site.')
      } else {
        setError(errorMessage)
      }

      setIsActive(false)

      // Clean up camera stream on error
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop())
        setCameraStream(null)
      }
      setXrSession(null)
      setXrReferenceSpace(null); // Clear reference space on error
    } finally {
      setIsInitializing(false)
    }
  }, [cameraStream])

  // Stop AR session
  const stopAR = useCallback(() => {
    if (xrSessionRef.current) {
      xrSessionRef.current.end()
      xrSessionRef.current = null
      setXrSession(null)
      setXrReferenceSpace(null); // Clear reference space on stop
    }
    setIsActive(false)

    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop())
      setCameraStream(null)
    }
  }, [cameraStream])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAR()
    }
  }, [stopAR])

  return {
    isSupported,
    isInitializing,
    isActive,
    error,
    xrSession,
    xrReferenceSpace, // New: Expose reference space
    startAR,
    stopAR,
    cameraStream,
  }
}
