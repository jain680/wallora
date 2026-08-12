import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-6xl font-serif text-stone-800 mb-4">404</h1>
      <p className="text-stone-600 mb-8 max-w-md">
        This page doesn&apos;t exist. Head back to upload a room or open the paint editor.
      </p>
      <div className="flex flex-wrap gap-4 justify-center">
        <Link
          href="/"
          className="bg-stone-800 text-white px-8 py-3 rounded-full font-medium hover:bg-black transition-colors"
        >
          Upload Room
        </Link>
        <Link
          href="/ar-preview"
          className="border border-stone-300 text-stone-700 px-8 py-3 rounded-full font-medium hover:bg-stone-50 transition-colors"
        >
          Paint Editor
        </Link>
      </div>
    </div>
  )
}
