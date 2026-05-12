'use client'

import { useEffect, useState } from 'react'

interface Props {
  documentBytes: Uint8Array | null
}

type RenderedPage = {
  pageNumber: number
  dataUrl: string
  width: number
  height: number
}

export function PDFPreview({ documentBytes }: Props) {
  const [pages, setPages] = useState<RenderedPage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function renderPreview() {
      if (!documentBytes || documentBytes.length === 0) {
        setPages([])
        setError('')
        return
      }

      setLoading(true)
      setError('')

      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
        const task = pdfjs.getDocument({
          data: documentBytes.slice(0),
          useSystemFonts: true,
        })
        const pdf = await task.promise
        const renderedPages: RenderedPage[] = []

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber)
          const viewport = page.getViewport({ scale: 1.35 })
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          if (!context) {
            throw new Error('Canvas rendering is unavailable in this browser.')
          }

          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          await page.render({ canvasContext: context, viewport, canvas } as any).promise

          renderedPages.push({
            pageNumber,
            dataUrl: canvas.toDataURL('image/png'),
            width: viewport.width,
            height: viewport.height,
          })
        }

        if (cancelled) return
        setPages(renderedPages)
      } catch (caught) {
        if (cancelled) return
        setPages([])
        setError(caught instanceof Error ? caught.message : 'Unable to render PDF preview.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    renderPreview()

    return () => {
      cancelled = true
    }
  }, [documentBytes])

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
        Rendering PDF pages…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (pages.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
        Add at least one line item to generate a preview.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2">
        <p className="text-xs font-medium text-gray-500">
          {pages.length} page{pages.length === 1 ? '' : 's'} rendered from the live request PDF
        </p>
        <span className="text-[11px] font-medium text-gray-400">Scroll preview</span>
      </div>
      <div className="h-80 overflow-y-auto px-4 py-3">
        <div className="mx-auto max-w-md space-y-3">
          {pages.map((page) => (
            <div
              key={page.pageNumber}
              className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
            >
              <img
                src={page.dataUrl}
                alt={`Request PDF page ${page.pageNumber}`}
                width={page.width}
                height={page.height}
                className="h-auto w-full"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
