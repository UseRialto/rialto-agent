import fs from 'node:fs'
import path from 'node:path'
import type { ExternalQuoteUploadFile } from './external-quote-file-ingestion'

export interface UploadedExternalQuoteFileReference {
  url: string
  filename?: string
  mimeType?: string
  sizeBytes?: number
}

function filenameFromUrl(url: string) {
  const pathname = url.startsWith('http') ? new URL(url).pathname : url
  return decodeURIComponent((pathname.split('/').pop() ?? 'quote-file').replace(/^\d+-/, '')) || 'quote-file'
}

function contentTypeForFilename(filename: string) {
  const ext = path.extname(filename).slice(1).toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'csv') return 'text/csv'
  if (ext === 'tsv') return 'text/tab-separated-values'
  if (ext === 'txt') return 'text/plain'
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (ext === 'xls' || ext === 'xsl') return 'application/vnd.ms-excel'
  if (ext === 'xml') return 'application/xml'
  return 'application/octet-stream'
}

function assertAllowedUploadUrl(url: string) {
  if (url.startsWith('/api/files/')) return
  const parsed = new URL(url)
  const hostname = parsed.hostname.toLowerCase()
  if (hostname.endsWith('.blob.vercel-storage.com') || hostname.endsWith('.vercel-storage.com')) return
  throw new Error('Quote import files must be uploaded through Rialto before importing.')
}

export async function loadUploadedExternalQuoteFile(
  reference: UploadedExternalQuoteFileReference,
  maxBytes: number,
): Promise<ExternalQuoteUploadFile> {
  if (!reference.url) throw new Error('Uploaded quote file URL is required.')
  assertAllowedUploadUrl(reference.url)
  const filename = reference.filename || filenameFromUrl(reference.url)

  if (reference.sizeBytes && reference.sizeBytes > maxBytes) {
    throw new Error(`${filename} is too large. Use files under ${Math.floor(maxBytes / 1024 / 1024)} MB.`)
  }

  if (reference.url.startsWith('/api/files/')) {
    const relativePath = reference.url.replace(/^\/api\/files\//, '')
    const uploadsRoot = path.resolve(process.cwd(), '.local', 'uploads')
    const resolved = path.resolve(uploadsRoot, relativePath)
    if (!resolved.startsWith(uploadsRoot) || !fs.existsSync(resolved)) {
      throw new Error(`${filename} could not be read from local uploads.`)
    }
    const buffer = fs.readFileSync(resolved)
    if (buffer.length > maxBytes) throw new Error(`${filename} is too large. Use files under ${Math.floor(maxBytes / 1024 / 1024)} MB.`)
    return {
      name: filename,
      type: reference.mimeType || contentTypeForFilename(filename),
      buffer,
    }
  }

  const response = await fetch(reference.url)
  if (!response.ok) throw new Error(`${filename} could not be downloaded for quote import.`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > maxBytes) throw new Error(`${filename} is too large. Use files under ${Math.floor(maxBytes / 1024 / 1024)} MB.`)
  return {
    name: filename,
    type: reference.mimeType || response.headers.get('content-type') || contentTypeForFilename(filename),
    buffer,
  }
}
