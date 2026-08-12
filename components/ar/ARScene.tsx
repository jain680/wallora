'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

interface ARSceneProps {
  paintColor: string
  opacity: number
  finish?: 'matte' | 'satin' | 'gloss'
  showAccentWall: boolean
  xrSession?: XRSession | null
  xrReferenceSpace?: XRReferenceSpace | null // New: Reference space
  onError?: (error: string) => void
}

/**
 * AR Scene Component
 * Renders a 3D wall plane in AR space using Three.js and WebXR
 * 
 * Future enhancement: Integrate wall segmentation AI model here
 * to detect real walls and overlay paint only on detected wall surfaces
 * The AI model would:
 * 1. Analyze camera feed in real-time
 * 2. Detect wall boundaries using computer vision
 * 3. Create 3D mesh matching detected wall geometry
 * 4. Apply paint overlay only to detected wall surfaces
 */
export default function ARScene({
  paintColor,
  opacity,
  finish = 'matte',
  showAccentWall,
  xrSession,
  xrReferenceSpace, // New prop
  onError,
}: ARSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const wallMeshesRef = useRef<THREE.Mesh[]>([])
  const reticleRef = useRef<THREE.Mesh | null>(null)
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null)
  const hitTestEnabledRef = useRef(false)
  const animationFrameRef = useRef<number | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    // Initialize Three.js scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Camera setup - will be updated by WebXR
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    cameraRef.current = camera

    // Renderer setup with WebXR support
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Transparent background for AR
    })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // Limit for performance
    renderer.xr.enabled = true // Enable WebXR
    renderer.xr.setReferenceSpaceType('local-floor')

    if (xrSession) {
      renderer.xr.setSession(xrSession)
    }

    // Reticle for hit testing
    const reticleGeometry = new THREE.RingGeometry(0.1, 0.12, 32).rotateX(-Math.PI / 2)
    const reticleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const reticle = new THREE.Mesh(reticleGeometry, reticleMaterial)
    reticle.matrixAutoUpdate = false
    reticle.visible = false
    scene.add(reticle)
    reticleRef.current = reticle

    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Lighting for AR
    // Lighting for AR
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5) // Lower ambient for more contrast
    scene.add(ambientLight)

    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5)
    hemisphereLight.position.set(0, 5, 0)
    scene.add(hemisphereLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
    directionalLight.position.set(2, 4, 3) // simulate sun/ceiling light
    scene.add(directionalLight)

    // We don't create a static wall mesh here anymore.
    // Instead, we'll create them dynamically on 'select' events.

    // WebXR's render loop
    renderer.setAnimationLoop((timestamp, frame) => {
      if (!xrReferenceSpace || !frame || !xrSession || !renderer.xr.isPresenting) return

      const pose = frame.getViewerPose(xrReferenceSpace)
      if (pose) {
        // Hit test for reticle
        if (hitTestEnabledRef.current) {
          if (!hitTestSourceRef.current) {
            const session = renderer.xr.getSession()
            if (session) {
              // @ts-expect-error WebXR hit-test API optional on session
              session.requestHitTestSource?.({ space: xrReferenceSpace }).then((source: XRHitTestSource | null) => {
                hitTestSourceRef.current = source
              })
            }
          }

          if (hitTestSourceRef.current) {
            const hitTestResults = frame.getHitTestResults(hitTestSourceRef.current)
            if (hitTestResults.length > 0) {
              const hit = hitTestResults[0]
              const hitPose = hit.getPose(xrReferenceSpace)
              if (hitPose && reticle) {
                reticle.matrix.fromArray(hitPose.transform.matrix)
                reticle.visible = true
              }
            } else if (reticle) {
              reticle.visible = false
            }
          }
        } else if (reticle) {
          reticle.visible = false
        }

        renderer.render(scene, camera)
      }
    })

    setIsInitialized(true)

    // Handle window resize
    const handleResize = () => {
      if (!camera || !renderer) return
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      if (rendererRef.current) {
        rendererRef.current.setAnimationLoop(null) // Stop XR animation loop
        rendererRef.current.dispose()
        if (containerRef.current && rendererRef.current.domElement.parentNode) {
          containerRef.current.removeChild(rendererRef.current.domElement)
        }
      }
      wallMeshesRef.current.forEach(mesh => {
        mesh.geometry.dispose()
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose()
        }
      })
      wallMeshesRef.current = []
      if (reticleRef.current) {
        reticleRef.current.geometry.dispose()
        if (reticleRef.current.material instanceof THREE.Material) {
          reticleRef.current.material.dispose()
        }
      }
      if (hitTestSourceRef.current) {
        hitTestSourceRef.current.cancel()
      }
    }
  }, [])

  // Handle user tap to place the wall
  useEffect(() => {
    if (!xrSession || !xrReferenceSpace || !rendererRef.current || !reticleRef.current) return

    const renderer = rendererRef.current
    const reticle = reticleRef.current

    // Enable hit testing when AR session starts
    hitTestEnabledRef.current = true

    const onSelect = (event: XRInputSourceEvent) => {
      const reticle = reticleRef.current
      const scene = sceneRef.current
      if (!scene || !reticle || !reticle.visible) return

      // Create a NEW wall at the reticle's position
      const wallGeometry = new THREE.PlaneGeometry(3, 2.5)
      const wallMaterial = new THREE.MeshStandardMaterial({
        color: paintColor,
        transparent: true,
        opacity: opacity,
        side: THREE.DoubleSide,
        roughness: finish === 'gloss' ? 0.2 : finish === 'satin' ? 0.5 : 0.9,
        metalness: finish === 'gloss' ? 0.3 : finish === 'satin' ? 0.1 : 0.0,
      })

      const newWall = new THREE.Mesh(wallGeometry, wallMaterial)
      newWall.position.setFromMatrixPosition(reticle.matrix)
      newWall.quaternion.setFromRotationMatrix(reticle.matrix)
      newWall.visible = showAccentWall

      scene.add(newWall)
      wallMeshesRef.current.push(newWall)
    }

    xrSession.addEventListener('select', onSelect)

    return () => {
      xrSession.removeEventListener('select', onSelect)
      hitTestEnabledRef.current = false
    }
  }, [xrSession, xrReferenceSpace, showAccentWall, paintColor, opacity, finish]);

  // Update paint color of the LAST placed wall or wait for new placement
  // Note: Only new walls get the new color by default in this implementation.
  // To update all walls, we could loop through wallMeshesRef.current.

  // Update opacity for all walls
  useEffect(() => {
    wallMeshesRef.current.forEach(mesh => {
      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.opacity = opacity
      }
    })
  }, [opacity])

  // Update finish for all walls
  useEffect(() => {
    wallMeshesRef.current.forEach(mesh => {
      if (mesh.material instanceof THREE.MeshStandardMaterial) {
        const mat = mesh.material;
        if (finish === 'gloss') {
          mat.roughness = 0.2;
          mat.metalness = 0.3;
        } else if (finish === 'satin') {
          mat.roughness = 0.5;
          mat.metalness = 0.1;
        } else {
          mat.roughness = 0.9;
          mat.metalness = 0.0;
        }
        mat.needsUpdate = true;
      }
    })
  }, [finish])

  // Toggle visibility for all walls
  useEffect(() => {
    wallMeshesRef.current.forEach(mesh => {
      mesh.visible = showAccentWall
    })
  }, [showAccentWall])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 1 }}
    />
  )
}
