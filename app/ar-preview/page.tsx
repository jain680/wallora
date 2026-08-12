'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAR } from '@/components/ar/useAR'
import ARScene from '@/components/ar/ARScene'
import CanvasFallback from '@/components/ar/CanvasFallback'
import { DEFAULT_PAINT_COLORS } from '@/utils/paintOverlay'
import { isWebXRSupported } from '@/components/ar/arUtils'
import { extractDominantColor } from '@/utils/colorExtractor'

export default function ARPreviewPage() {
  const router = useRouter()
  const [selectedColor, setSelectedColor] = useState(DEFAULT_PAINT_COLORS[2].hex)
  const [opacity, setOpacity] = useState(0.8)
  const [showAccentWall, setShowAccentWall] = useState(true)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [analysisResults, setAnalysisResults] = useState<any>(null)
  const [selectedMaterial, setSelectedMaterial] = useState<'matte' | 'silk' | 'velvet' | 'metallic' | 'marble' | 'concrete'>('matte')
  const [selectedWallpaper, setSelectedWallpaper] = useState<string | null>(null)
  const [timeOfDay, setTimeOfDay] = useState(0.5)
  const [useFallback, setUseFallback] = useState(false)
  const [isCheckingSupport, setIsCheckingSupport] = useState(true)
  const [isSamplingColor, setIsSamplingColor] = useState(false)
  const [isRefining, setIsRefining] = useState(false)

  const { isSupported, isActive, error, xrSession, xrReferenceSpace, startAR, stopAR } = useAR()

  const [debouncedColor, setDebouncedColor] = useState(selectedColor)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedColor(selectedColor)
    }, 100)
    return () => clearTimeout(handler)
  }, [selectedColor])

  useEffect(() => {
    const storedImage = sessionStorage.getItem('imagePreview')
    const storedAnalysis = sessionStorage.getItem('analysisResults')
    if (storedImage) {
      setImagePreview(storedImage)
      if (storedAnalysis) {
        setAnalysisResults(JSON.parse(storedAnalysis))
      }
    } else {
      router.push('/')
    }

    const checkSupport = async () => {
      setIsCheckingSupport(true)
      try {
        const supported = await isWebXRSupported()
        if (!supported) setUseFallback(true)
      } catch (err) {
        setUseFallback(true)
      } finally {
        setIsCheckingSupport(false)
      }
    }
    checkSupport()
  }, [router])

  const handleStartAR = async () => {
    try {
      await startAR()
    } catch (err) {
      console.error('Failed to start AR:', err)
      setUseFallback(true)
    }
  }

  const handleRefineChoice = async () => {
    if (!imagePreview) return
    setIsRefining(true)
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imagePreview.split(',')[1],
          mimeType: imagePreview.split(',')[0].replace('data:', '').replace(';base64', ''),
          customPrompt: `Critique this specific combination: Color ${selectedColor}, Material ${selectedMaterial}.`,
        }),
      })
      if (response.ok) {
        const data = await response.json()
        setAnalysisResults(data)
      }
    } catch (error) {
      console.error('Refinement error:', error)
    } finally {
      setIsRefining(false)
    }
  }

  const getColorName = (hex: string) =>
    DEFAULT_PAINT_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name || 'Custom Color'

  if (isCheckingSupport) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]">
        <div className="animate-pulse text-stone-400 font-serif text-xl">Loading Studio...</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 top-0 pt-20 bg-[#F9F8F6] flex overflow-hidden">

      <div className="w-20 lg:w-24 bg-white border-r border-stone-100 flex flex-col items-center py-8 gap-8 z-20 shadow-sm hidden md:flex">
        <div className="flex flex-col gap-6">
          <button
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${!selectedWallpaper ? 'bg-stone-800 text-white shadow-lg' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}
            onClick={() => setSelectedWallpaper(null)}
            title="Paint"
          >
            🎨
          </button>
          <button
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${selectedWallpaper ? 'bg-stone-800 text-white shadow-lg' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}
            onClick={() => setSelectedWallpaper('/textures/floral-paper.png')}
            title="Wallpaper"
          >
            🖼️
          </button>
        </div>

        <div className="w-10 h-px bg-stone-200" />

        <div className="flex flex-col gap-4">
          {['matte', 'silk', 'velvet'].map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMaterial(m as any)}
              className={`text-[10px] uppercase font-bold tracking-widest -rotate-90 h-16 w-8 rounded flex items-center justify-center transition-colors ${selectedMaterial === m ? 'text-stone-800' : 'text-stone-300 hover:text-stone-500'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 relative bg-stone-100 p-4 lg:p-8 flex flex-col items-center justify-center overflow-hidden">

        <div className="mb-4 flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm text-sm font-medium text-stone-600">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-stone-300'}`}></span>
            {isActive ? 'Live AR Active' : useFallback ? 'Photo Mode' : 'Initializing...'}
          </div>
          {!isSupported && useFallback && (
            <span className="text-xs text-stone-400 border-l border-stone-200 pl-2 ml-2">
              (Live AR requires HTTPS)
            </span>
          )}
          {isSupported && (
            <button
              onClick={() => {
                if (isActive) stopAR()
                setUseFallback(!useFallback)
              }}
              className="ml-2 text-sage-dark hover:text-sage-darker underline text-xs"
            >
              Switch to {useFallback ? 'Live AR' : 'Photo Mode'}
            </button>
          )}
        </div>

        <div className="relative w-full h-full bg-white rounded-[2rem] shadow-2xl overflow-hidden border-4 border-white">
          {(useFallback || !isSupported) ? (
            imagePreview ? (
              <div className="w-full h-full">
                <CanvasFallback
                  imageUrl={imagePreview}
                  paintColor={debouncedColor}
                  opacity={opacity}
                  showAccentWall={showAccentWall}
                  activeMaterial={selectedMaterial}
                  activeWallpaper={selectedWallpaper}
                  timeOfDay={timeOfDay}
                />

                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white/70 backdrop-blur-xl px-4 py-3 rounded-2xl shadow-2xl border border-white/40 flex items-center gap-3 max-w-[90%] overflow-x-auto z-30">
                  {DEFAULT_PAINT_COLORS.map((color) => (
                    <button
                      key={color.hex}
                      onClick={() => setSelectedColor(color.hex)}
                      className={`w-10 h-10 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0 ${selectedColor === color.hex ? 'border-stone-800 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: color.hex }}
                      title={color.name}
                    />
                  ))}
                  <div className="w-px h-8 bg-stone-200 mx-2" />
                  <input
                    type="color"
                    value={selectedColor}
                    onChange={(e) => setSelectedColor(e.target.value)}
                    className="w-10 h-10 rounded-full cursor-pointer border-none bg-transparent p-0"
                  />
                </div>
              </div>
            ) : (
              <div className="flex text-stone-400">Loading...</div>
            )
          ) : isActive ? (
            <ARScene
              paintColor={selectedColor}
              opacity={opacity}
              showAccentWall={showAccentWall}
              xrSession={xrSession}
              xrReferenceSpace={xrReferenceSpace}
              onError={() => setUseFallback(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <button onClick={handleStartAR} className="bg-stone-800 text-white px-8 py-4 rounded-full font-bold shadow-xl hover:scale-105 transition-transform">
                Start Camera AR
              </button>
              <button onClick={() => setUseFallback(true)} className="text-stone-500 underline">
                Use Photo Mode
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="w-80 bg-white border-l border-stone-100 hidden lg:flex flex-col p-6 overflow-y-auto">
        <h2 className="font-serif text-2xl text-stone-800 mb-6 font-medium">Design Studio</h2>

        <div className="bg-[#F9F8F6] p-5 rounded-2xl mb-8 border border-stone-200">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full shadow-inner border border-white" style={{ backgroundColor: selectedColor }}></div>
            <div>
              <h3 className="font-serif text-lg text-stone-900">{getColorName(selectedColor)}</h3>
              <p className="text-xs text-stone-500 uppercase tracking-widest">{selectedMaterial}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-bold text-stone-400 uppercase mb-2">Opacity</div>
              <input
                type="range" min="0.1" max="1" step="0.1"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-full accent-stone-800 h-1 bg-stone-200 rounded-lg appearance-none"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold text-stone-400 uppercase mb-2">Lighting ({timeOfDay < 0.5 ? 'AM' : 'PM'})</div>
              <input
                type="range" min="0" max="1" step="0.1"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(parseFloat(e.target.value))}
                className="w-full accent-stone-800 h-1 bg-stone-200 rounded-lg appearance-none"
              />
            </div>
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm text-stone-800 uppercase tracking-widest">Designer Insight</h3>
            <button
              onClick={handleRefineChoice}
              disabled={isRefining}
              className="text-xs text-white bg-black px-3 py-1 rounded-full hover:bg-stone-700 disabled:opacity-50"
            >
              {isRefining ? 'Thinking...' : 'Refine'}
            </button>
          </div>

          <div className="bg-stone-900 text-stone-50 p-6 rounded-2xl shadow-xl relative overflow-hidden min-h-[200px]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <p className="font-serif italic text-lg leading-relaxed opacity-90 relative z-10">
              {analysisResults?.verdict ? `"${analysisResults.verdict.substring(0, 150)}..."` : '"This shade brings out the warmth in your natural lighting. Try mixing with velvet textures."'}
            </p>
            <div className="mt-4 flex gap-2 flex-wrap">
              {['Elegant', 'Modern', 'Cozy'].map((tag) => (
                <span key={tag} className="text-[10px] border border-white/20 px-2 py-1 rounded-full">{tag}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-stone-100 flex gap-4">
          <button onClick={() => router.push('/')} className="flex-1 py-3 border border-stone-200 rounded-xl text-stone-600 font-medium hover:bg-stone-50">Back Home</button>
        </div>
      </div>

    </div>
  )
}
