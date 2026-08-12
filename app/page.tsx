'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import ImageUpload from '@/components/ImageUpload'
import LoadingSpinner from '@/components/LoadingSpinner'

const HERO_IMAGES = [
  '/hero-video.mp4?v=1',
  '/hero-12.png',
  '/hero-13.png',
  '/hero-9.png',
  '/hero-10.png',
  '/hero-11.png',
  '/hero-2.png',
  '/hero-3.png',
  '/hero-4.png'
]

export default function Home() {
  const router = useRouter()
  const [viewState, setViewState] = useState<'landing' | 'uploading'>('landing')
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0)

  useEffect(() => {
    if (viewState !== 'landing') return
    const interval = setInterval(() => {
      setCurrentHeroIndex((prev) => (prev + 1) % HERO_IMAGES.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [viewState])

  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleImageSelect = (file: File | null) => {
    if (file) {
      setSelectedImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
      setError(null)
    } else {
      setSelectedImage(null)
      setImagePreview(null)
    }
  }

  const handleGenerate = async () => {
    if (!selectedImage) return
    setIsLoading(true)
    setError(null)

    try {
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const result = reader.result as string
          const base64 = result.split(',')[1]
          resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(selectedImage)
      })

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Image,
          mimeType: selectedImage.type,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to analyze image')
      }

      const data = await response.json()
      sessionStorage.setItem('designResults', JSON.stringify(data))
      sessionStorage.setItem('imagePreview', imagePreview || '')
      router.push('/suggestions')
    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#F9F8F6]">
      <div className="absolute top-0 right-0 w-[50vh] h-[50vh] bg-sage-light rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[60vh] h-[60vh] bg-stone-200 rounded-full blur-3xl opacity-40 translate-y-1/3 -translate-x-1/4 pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 py-12 lg:py-20">

        {viewState === 'landing' && (
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16 transition-opacity duration-500 ease-in-out">
            <div className="flex-1 text-center lg:text-left">
              <span className="inline-block px-4 py-1.5 mb-6 text-[10px] lg:text-xs font-bold tracking-widest text-sage-dark uppercase bg-sage-light/50 backdrop-blur-sm rounded-full">
                AI Interior Designer
              </span>
              <h1 className="text-4xl md:text-5xl lg:text-7xl font-serif text-stone-900 leading-[1.1] mb-6 lg:mb-8 tracking-tight">
                Visualize your walls <br />
                <span className="italic text-sage font-light">before you paint.</span>
              </h1>
              <p className="text-base lg:text-lg text-stone-600 mb-8 lg:mb-10 max-w-xl mx-auto lg:mx-0 font-light leading-relaxed px-4 lg:px-0">
                Upload a photo of your room. Our AI suggests eclectic palettes,
                detects walls, and lets you redesign in seconds.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                <button
                  onClick={() => setViewState('uploading')}
                  className="bg-stone-800 text-white px-10 py-5 rounded-full font-medium hover:bg-black transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1"
                >
                  Start Your Redesign
                </button>
                <Link href="/about" className="text-stone-500 font-medium hover:text-stone-800 px-6 py-4 transition-colors">
                  How it Works
                </Link>
              </div>
            </div>

            <div className="flex-1 relative w-full aspect-square max-w-md lg:max-w-xl">
              <div className="relative h-full w-full rounded-[2rem] overflow-hidden shadow-2xl border-8 border-white group">
                {HERO_IMAGES.map((src, index) => (
                  <div
                    key={src}
                    className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${index === currentHeroIndex ? 'opacity-100' : 'opacity-0'
                      }`}
                  >
                    {src.match(/\.(mp4|webm)(\?.*)?$/i) ? (
                      <video
                        src={src}
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <Image
                        src={src}
                        alt={`Aesthetic Room Preview ${index + 1}`}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        className="object-cover"
                        priority={index === 0 || index === 1}
                      />
                    )}
                  </div>
                ))}

                <div className="absolute -bottom-8 -left-8 bg-white p-5 rounded-xl shadow-xl border border-stone-100 max-w-[200px] z-10 transition-transform hover:scale-105 duration-300">
                  <div className="flex gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-[#94A38C]"></div>
                    <div className="w-6 h-6 rounded-full bg-[#C17C74]"></div>
                    <div className="w-6 h-6 rounded-full bg-[#D4C2A8]"></div>
                  </div>
                  <p className="text-xs text-stone-500 font-medium">Auto-generated palettes</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {viewState === 'uploading' && (
          <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className="text-center mb-10">
              <button
                onClick={() => setViewState('landing')}
                className="text-stone-400 hover:text-stone-800 mb-6 flex items-center justify-center gap-2 mx-auto text-sm font-medium transition-colors"
              >
                ← Back to Home
              </button>
              <h2 className="text-4xl font-serif text-stone-900 mb-4">Let's see your room.</h2>
              <p className="text-stone-500">Upload a well-lit photo for the best results.</p>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-xl border border-stone-100">
              {isLoading ? (
                <div className="py-20 text-center">
                  <LoadingSpinner />
                  <p className="mt-8 font-serif text-xl text-stone-800 animate-pulse">Analyzing architecture...</p>
                  <p className="text-sm text-stone-400 mt-2">Creating your design profile</p>
                </div>
              ) : (
                <>
                  <ImageUpload
                    onImageSelect={handleImageSelect}
                    selectedImage={selectedImage}
                    imagePreview={imagePreview}
                  />

                  {error && (
                    <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
                      {error}
                    </div>
                  )}

                  {selectedImage && (
                    <div className="mt-8 flex justify-center">
                      <button
                        onClick={handleGenerate}
                        className="bg-sage hover:bg-sage-dark text-white text-lg px-12 py-4 rounded-full font-medium transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                      >
                        Analyze & Redesign ✨
                      </button>
                    </div>
                  )}

                  {selectedImage && (
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => {
                          if (imagePreview) {
                            sessionStorage.setItem('imagePreview', imagePreview)
                            router.push('/ar-preview')
                          }
                        }}
                        className="text-stone-500 hover:text-stone-800 text-sm font-medium transition-colors"
                      >
                        Skip Analysis, Open Editor →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
