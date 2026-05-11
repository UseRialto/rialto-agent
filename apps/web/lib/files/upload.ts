import fs from 'fs'
import path from 'path'
import { put } from '@vercel/blob'

export type UploadedFileResult = {
  url: string
  filename: string
  mimeType: string
  sizeBytes: number
}

function safeUploadFolder(rawFolder: string) {
  return rawFolder
    .split(/[\\/]/)
    .map((segment) => segment.replace(/[^a-zA-Z0-9-_]/g, ''))
    .filter(Boolean)
    .join(path.sep)
}

export async function saveUploadedFile(input: { file: File; folder: string }): Promise<UploadedFileResult> {
  const safeFolder = safeUploadFolder(input.folder)
  if (!safeFolder) throw new Error('Invalid upload destination')

  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const mimeType = input.file.type || 'application/octet-stream'

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`${safeFolder.split(path.sep).join('/')}/${safeName}`, input.file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: mimeType,
    })

    return {
      url: blob.url,
      filename: input.file.name,
      mimeType,
      sizeBytes: input.file.size,
    }
  }

  if (process.env.VERCEL) {
    throw new Error('File uploads require Vercel Blob. Add BLOB_READ_WRITE_TOKEN to this deployment.')
  }

  const uploadDir = path.join(process.cwd(), '.local', 'uploads', safeFolder)
  fs.mkdirSync(uploadDir, { recursive: true })

  const filename = `${Date.now()}-${safeName}`
  const buffer = Buffer.from(await input.file.arrayBuffer())
  fs.writeFileSync(path.join(uploadDir, filename), buffer)

  const urlPath = safeFolder.split(path.sep).join('/')
  return {
    url: `/api/files/${urlPath}/${filename}`,
    filename: input.file.name,
    mimeType,
    sizeBytes: input.file.size,
  }
}
