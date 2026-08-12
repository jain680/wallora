'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ImageUpload from '@/components/ImageUpload'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function UploadPage() {
  const router = useRouter()
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const handleImageSelect = (file: File | null) => {
    if (file) {
      setSelectedImage(file)
      const reader = new FileReader()
      reader.onloadend = () => setImagePreview(reader.result as string)
      reader.readAsDataURL(file)
      setError(null)
      setErrorCode(null)
    } else {
      setSelectedImage(null)
      setImagePreview(null)
    }
  }

  const handleGenerate = async () => {
    if (!selectedImage) return
    setIsLoading(true)
    setError(null)
    setErrorCode(null)

    try {
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
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

      const data = await response.json()

      if (!response.ok) {
        setErrorCode(data.errorCode || null)
        if (data.errorCode === 'QUOTA_EXCEEDED') {
          throw new Error(
            'OpenAI API quota exceeded. Please check your billing at https://platform.openai.com/account/billing'
          )
        }
        if (data.errorCode === 'INVALID_API_KEY') {
          throw new Error('Invalid OpenAI API key. Please check your .env.local file and ensure OPENAI_API_KEY is set correctly.')
        }
        if (data.errorCode === 'PAYMENT_REQUIRED') {
          throw new Error('Payment required. Please add a payment method to your OpenAI account.')
        }
        throw new Error(data.error || 'Failed to analyze image')
      }

      sessionStorage.setItem('designResults', JSON.stringify(data))
      sessionStorage.setItem('imagePreview', imagePreview || '')
      router.push('/suggestions')
    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-warm-50 py-12">
      <div className="max-w-3xl mx-auto px-4">
        <div className="text-center mb-10">
          <Link href="/" className="text-warm-500 hover:text-warm-800 mb-6 inline-block text-sm font-medium">
            ← Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-warm-800 mb-4">Upload Your Room</h1>
          <p className="text-warm-600">Get AI-powered design suggestions</p>
        </div>

        <div className="card">
          {isLoading ? (
            <div className="py-20 text-center">
              <LoadingSpinner />
              <p className="mt-8 text-warm-800 animate-pulse">Analyzing your room...</p>
            </div>
          ) : (
            <>
              <ImageUpload
                onImageSelect={handleImageSelect}
                selectedImage={selectedImage}
                imagePreview={imagePreview}
              />

              {error && (
                <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-lg text-sm border border-red-200">
                  <p>{error}</p>
                  {errorCode === 'QUOTA_EXCEEDED' && (
                    <p className="mt-2 text-xs">
                      💡 <strong>Tip:</strong> To test the app without API credits, add{' '}
                      <code className="bg-red-200 px-1 rounded">USE_DEMO_MODE=true</code> to your{' '}
                      <code className="bg-red-200 px-1 rounded">.env.local</code> file
                    </p>
                  )}
                </div>
              )}

              {selectedImage && (
                <div className="mt-8 flex justify-center">
                  <button onClick={handleGenerate} className="btn-primary text-lg px-12 py-4">
                    Generate Suggestions
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
