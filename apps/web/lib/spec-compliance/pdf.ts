import fs from 'fs'
import path from 'path'
import type { ExtractedPdfPage } from './types'

const UPLOADS_ROOT = path.join(process.cwd(), '.local', 'uploads')

let pdfRuntimeReady: Promise<void> | undefined

async function ensurePdfRuntime() {
  pdfRuntimeReady ??= (async () => {
    const canvas = await import('@napi-rs/canvas')
    const globalWithCanvas = globalThis as Record<string, unknown>

    globalWithCanvas['DOMMatrix'] ??= canvas.DOMMatrix
    globalWithCanvas['DOMPoint'] ??= canvas.DOMPoint
    globalWithCanvas['DOMRect'] ??= canvas.DOMRect
    globalWithCanvas['ImageData'] ??= canvas.ImageData
    globalWithCanvas['Path2D'] ??= canvas.Path2D
  })()
  await pdfRuntimeReady
}

async function readUploadedFile(fileUrl: string): Promise<Uint8Array> {
  if (fileUrl.startsWith('/api/files/')) {
    const relative = fileUrl.replace(/^\/api\/files\//, '').split('/').map(decodeURIComponent)
    const resolved = path.resolve(path.join(UPLOADS_ROOT, ...relative))
    if (!resolved.startsWith(path.resolve(UPLOADS_ROOT))) {
      throw new Error('Spec document path is outside the upload directory.')
    }
    return new Uint8Array(fs.readFileSync(resolved))
  }

  if (/^https?:\/\//i.test(fileUrl)) {
    const response = await fetch(fileUrl)
    if (!response.ok) throw new Error(`Unable to fetch spec PDF (${response.status}).`)
    return new Uint8Array(await response.arrayBuffer())
  }

  throw new Error('Unsupported spec document URL.')
}

export async function extractPdfPages(fileUrl: string): Promise<{ pageCount: number; pages: ExtractedPdfPage[] }> {
  await ensurePdfRuntime()
  const [pdfjs, pdfjsWorker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ])
  ;(globalThis as typeof globalThis & { pdfjsWorker?: typeof pdfjsWorker }).pdfjsWorker = pdfjsWorker
  const data = await readUploadedFile(fileUrl)
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const pdf = await loadingTask.promise
  const pages: ExtractedPdfPage[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    pages.push({ pageNumber, text })
  }

  return { pageCount: pdf.numPages, pages }
}
