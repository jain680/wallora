export default function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="relative w-16 h-16 mb-4">
        <div className="absolute top-0 left-0 w-full h-full border-4 border-warm-200 rounded-full"></div>
        <div className="absolute top-0 left-0 w-full h-full border-4 border-warm-600 rounded-full border-t-transparent animate-spin"></div>
      </div>
      <p className="text-warm-600 text-lg">Analyzing your room...</p>
      <p className="text-warm-500 text-sm mt-2">This may take a few moments</p>
    </div>
  )
}
