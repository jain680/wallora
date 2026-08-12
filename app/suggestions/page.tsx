'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface DesignResults {
  roomAnalysis: string
  paintColors: string
  accentWall: string
  wallTextures: string
  luxuryTouches: string
  lightingAmbiance: string
  pinterestLookbook: string
  paintBrands: string
  verdict: string
}

export default function SuggestionsPage() {
  const [results, setResults] = useState<DesignResults | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const storedResults = sessionStorage.getItem('designResults')
    const storedImage = sessionStorage.getItem('imagePreview')
    if (storedResults) {
      setResults(JSON.parse(storedResults))
      setImagePreview(storedImage)
    } else {
      router.push('/')
    }
  }, [router])

  if (!results) return null

  return (
    <div className="min-h-screen bg-[#F9F8F6] pb-20">
      <div className="bg-white border-b border-stone-100 py-12 px-6 lg:px-12 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-sage-light rounded-full blur-3xl opacity-30 translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <h1 className="font-serif text-4xl lg:text-5xl text-stone-900 mb-4 relative z-10">Your Design Blueprint</h1>
        <p className="text-stone-500 font-light text-lg max-w-2xl mx-auto relative z-10">
          Curated by AI for a pinterest-worthy transformation.
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          <div className="lg:col-span-4 space-y-8">
            {imagePreview && (
              <div className="rounded-[2rem] overflow-hidden shadow-2xl border-4 border-white relative group">
                <img src={imagePreview} className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105" alt="Original Room" />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-6 pt-20">
                  <span className="text-white font-serif italic text-lg opacity-90">Original Space</span>
                </div>
              </div>
            )}

            <div className="bg-stone-800 text-stone-50 p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-clay rounded-full blur-3xl opacity-50"></div>
              <h3 className="font-serif text-2xl mb-4 relative z-10">The Verdict</h3>
              <p className="font-light italic leading-relaxed opacity-90 relative z-10 text-lg">
                &ldquo;{results.verdict}&rdquo;
              </p>
              <div className="mt-6 pt-6 border-t border-white/10 flex justify-between items-center text-sm font-bold tracking-widest uppercase text-stone-400">
                <span>Wallora AI</span>
                <span>2024 Collection</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100 hover:shadow-md transition-shadow">
              <span className="text-4xl mb-4 block">🔍</span>
              <h3 className="font-serif text-xl text-stone-900 mb-3">Spatial Analysis</h3>
              <p className="text-stone-600 font-light leading-relaxed">{results.roomAnalysis}</p>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100 hover:shadow-md transition-shadow border-l-4 border-sage">
              <span className="text-4xl mb-4 block">🎨</span>
              <h3 className="font-serif text-xl text-stone-900 mb-3">Curated Palette</h3>
              <p className="text-stone-600 font-light leading-relaxed whitespace-pre-line">{results.paintColors}</p>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100 hover:shadow-md transition-shadow">
              <span className="text-4xl mb-4 block">🧱</span>
              <h3 className="font-serif text-xl text-stone-900 mb-3">Texture & Finish</h3>
              <p className="text-stone-600 font-light leading-relaxed">{results.wallTextures}</p>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100 hover:shadow-md transition-shadow md:col-span-2 bg-gradient-to-br from-white to-stone-50">
              <span className="text-4xl mb-4 block">💡</span>
              <h3 className="font-serif text-xl text-stone-900 mb-3">Lighting Ambiance</h3>
              <p className="text-stone-600 font-light leading-relaxed">{results.lightingAmbiance}</p>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100 hover:shadow-md transition-shadow">
              <span className="text-4xl mb-4 block">👑</span>
              <h3 className="font-serif text-xl text-stone-900 mb-3">Luxury Touches</h3>
              <p className="text-stone-600 font-light leading-relaxed">{results.luxuryTouches}</p>
            </div>

            <div className="bg-clay/10 p-8 rounded-3xl shadow-sm border border-clay/20 hover:shadow-md transition-shadow">
              <span className="text-4xl mb-4 block">📸</span>
              <h3 className="font-serif text-xl text-clay-dark mb-3">Pinterest Style Guide</h3>
              <p className="text-stone-700 font-light leading-relaxed">{results.pinterestLookbook}</p>
            </div>
          </div>
        </div>

        <div className="mt-16 text-center">
          <Link
            href="/ar-preview"
            className="inline-flex items-center gap-3 bg-stone-900 text-white px-12 py-5 rounded-full text-lg font-medium hover:bg-black transition-all shadow-xl hover:-translate-y-1 group"
          >
            <span>Open in Editor</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <p className="mt-4 text-stone-400 text-sm">Visualize these suggestions in 3D</p>
        </div>
      </div>
    </div>
  )
}
