import fs from 'fs'
import path from 'path'
import { loadPdfJs } from '@/lib/pdf/runtime'
import type { ExtractedPdfPage } from './types'

const UPLOADS_ROOT = path.join(process.cwd(), '.local', 'uploads')

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
  const pdfjs = await loadPdfJs()
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
