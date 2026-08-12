import { NextResponse } from 'next/server'

/**
 * Segmentation is now handled client-side via canvas flood-fill in CanvasFallback.tsx.
 * This route is kept for backwards compatibility but is no longer used.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Server-side segmentation is disabled. Wall detection runs in the browser via flood-fill.',
    },
    { status: 501 }
  )
}
