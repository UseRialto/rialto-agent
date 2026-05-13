'use client'

import { upload } from '@vercel/blob/client'

export type ClientUploadedFileResult = {
  url: string
  filename: string
  mimeType: string
  sizeBytes: number
}

type UploadProgress = {
  loaded: number
  total: number
  percentage: number
}

type BlobUploadConfig = {
  directUploadAvailable?: boolean
  maxSizeBytes?: number
  requestAttachmentMaxSizeBytes?: number
}

function safeBlobPathSegment(rawSegment: string) {
  return rawSegment.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '')
}

function safeBlobFolder(rawFolder: string) {
  return rawFolder
    .split(/[\\/]/)
    .map((segment) => safeBlobPathSegment(segment))
    .filter(Boolean)
    .join('/')
}

function isLocalHost() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

async function getBlobUploadConfig(): Promise<BlobUploadConfig> {
  try {
    const response = await fetch('/api/blob-upload', { method: 'GET' })
    if (!response.ok) return {}
    return (await response.json()) as BlobUploadConfig
  } catch {
    return {}
  }
}

async function uploadProjectSpecPdfToLocalDev(file: File, folder: string): Promise<ClientUploadedFileResult> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('folder', folder)

  const response = await fetch('/api/upload', { method: 'POST', body: formData })
  const json = await response.json() as {
    url?: string
    filename?: string
    mimeType?: string
    sizeBytes?: number
    error?: string
  }

  if (!response.ok || !json.url) throw new Error(json.error ?? `Failed to upload ${file.name}.`)

  return {
    url: json.url,
    filename: json.filename ?? file.name,
    mimeType: json.mimeType ?? (file.type || 'application/octet-stream'),
    sizeBytes: json.sizeBytes ?? file.size,
  }
}

export async function uploadProjectSpecPdf(
  file: File,
  folder: string,
  onUploadProgress?: (progress: UploadProgress) => void,
): Promise<ClientUploadedFileResult> {
  const safeFolder = safeBlobFolder(folder)
  const safeName = safeBlobPathSegment(file.name)
  const mimeType = 'application/pdf'

  if (!safeFolder || !safeName) throw new Error('Invalid project spec upload destination.')
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Project spec uploads must be PDF files.')

  const config = await getBlobUploadConfig()
  if (!config.directUploadAvailable) {
    if (isLocalHost()) return uploadProjectSpecPdfToLocalDev(file, safeFolder)
    throw new Error('Vercel Blob is not configured. Connect the project Blob store and set BLOB_READ_WRITE_TOKEN.')
  }

  if (config.maxSizeBytes && file.size > config.maxSizeBytes) {
    throw new Error(`Project spec PDFs must be ${Math.floor(config.maxSizeBytes / 1024 / 1024)} MB or smaller.`)
  }

  const blob = await upload(`${safeFolder}/${safeName}`, file, {
    access: 'public',
    handleUploadUrl: '/api/blob-upload',
    contentType: mimeType,
    multipart: true,
    clientPayload: JSON.stringify({
      filename: file.name,
      contentType: mimeType,
      sizeBytes: file.size,
    }),
    onUploadProgress,
  })

  return {
    url: blob.url,
    filename: file.name,
    mimeType,
    sizeBytes: file.size,
  }
}

export async function uploadRequestAttachmentFile(
  file: File,
  folder: string,
  onUploadProgress?: (progress: UploadProgress) => void,
): Promise<ClientUploadedFileResult> {
  const safeFolder = safeBlobFolder(folder)
  const safeName = safeBlobPathSegment(file.name)
  const mimeType = file.type || 'application/octet-stream'
  const requestAttachmentFolder = safeFolder.startsWith('request-attachments/')
    ? safeFolder
    : `request-attachments/${safeFolder}`

  if (!safeFolder || !safeName) throw new Error('Invalid request attachment upload destination.')

  const config = await getBlobUploadConfig()
  if (!config.directUploadAvailable) {
    if (isLocalHost()) return uploadProjectSpecPdfToLocalDev(file, requestAttachmentFolder)
    throw new Error('Vercel Blob is not configured. Connect the project Blob store and set BLOB_READ_WRITE_TOKEN.')
  }

  if (config.requestAttachmentMaxSizeBytes && file.size > config.requestAttachmentMaxSizeBytes) {
    throw new Error(`Request attachments must be ${Math.floor(config.requestAttachmentMaxSizeBytes / 1024 / 1024)} MB or smaller.`)
  }

  const blob = await upload(`${requestAttachmentFolder}/${safeName}`, file, {
    access: 'public',
    handleUploadUrl: '/api/blob-upload',
    contentType: mimeType,
    multipart: file.size > 8 * 1024 * 1024,
    clientPayload: JSON.stringify({
      filename: file.name,
      contentType: mimeType,
      sizeBytes: file.size,
    }),
    onUploadProgress,
  })

  return {
    url: blob.url,
    filename: file.name,
    mimeType,
    sizeBytes: file.size,
  }
}
