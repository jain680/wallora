'use client'

import { useState, useRef } from 'react'

interface ImageUploadProps {
  onImageSelect: (file: File) => void
  selectedImage: File | null
  imagePreview: string | null
}

export default function ImageUpload({ onImageSelect, selectedImage, imagePreview }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (file: File) => {
    if (file && (file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/jpg')) {
      onImageSelect(file)
    } else {
      alert('Please upload a JPG or PNG image')
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  return (
    <div className="w-full">
      {!imagePreview ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
            ${isDragging ? 'border-warm-500 bg-warm-50' : 'border-warm-300 hover:border-warm-400'}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg"
            onChange={handleFileInput}
            className="hidden"
          />
          <div className="text-5xl mb-4">📸</div>
          <p className="text-lg font-medium text-warm-700 mb-2">
            Drag and drop your room image here
          </p>
          <p className="text-warm-600 mb-4">or</p>
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              fileInputRef.current?.click()
            }}
            className="btn-primary"
          >
            Browse Files
          </button>
          <p className="text-sm text-warm-500 mt-4">
            Supports JPG and PNG files
          </p>
        </div>
      ) : (
        <div className="relative">
          <div className="relative w-full rounded-xl overflow-hidden border-2 border-warm-200 bg-warm-50 flex items-center justify-center">
            <img
              src={imagePreview}
              alt="Room preview"
              className="max-w-full h-auto object-contain"
              style={{ maxHeight: '80vh' }}
            />
          </div>
          <button
            onClick={() => {
              onImageSelect(null as any)
              if (fileInputRef.current) {
                fileInputRef.current.value = ''
              }
            }}
            className="mt-4 text-warm-600 hover:text-warm-700 underline"
          >
            Remove image
          </button>
        </div>
      )}
    </div>
  )
}
