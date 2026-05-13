import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'

export const runtime = 'nodejs'

const MAX_SPEC_PDF_BYTES = 1024 * 1024 * 1024 // 1 GB
const MAX_REQUEST_ATTACHMENT_BYTES = 100 * 1024 * 1024 // 100 MB
const REQUEST_ATTACHMENT_CONTENT_TYPES = [
  'application/pdf',
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/png',
  'image/jpeg',
  'application/octet-stream',
]

type ClientPayload = {
  filename?: string
  contentType?: string
  sizeBytes?: number
}

function parseClientPayload(rawPayload: string | null): ClientPayload {
  if (!rawPayload) return {}
  try {
    const parsed = JSON.parse(rawPayload) as ClientPayload
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function validateProjectSpecUpload(pathname: string, payload: ClientPayload) {
  const normalizedPath = pathname.replace(/\\/g, '/')
  const filename = payload.filename ?? normalizedPath.split('/').at(-1) ?? ''
  const contentType = payload.contentType ?? 'application/pdf'

  if (normalizedPath !== pathname || normalizedPath.includes('..')) {
    throw new Error('Invalid upload path.')
  }
  if (!normalizedPath.startsWith('project-specs/')) {
    throw new Error('Project spec uploads must use the project-specs folder.')
  }
  if (!filename.toLowerCase().endsWith('.pdf')) {
    throw new Error('Project spec uploads must be PDF files.')
  }
  if (contentType !== 'application/pdf') {
    throw new Error('Project spec uploads must use application/pdf content type.')
  }
  if (payload.sizeBytes && payload.sizeBytes > MAX_SPEC_PDF_BYTES) {
    throw new Error('Project spec PDFs must be 1 GB or smaller.')
  }
}

function validateRequestAttachmentUpload(pathname: string, payload: ClientPayload) {
  const normalizedPath = pathname.replace(/\\/g, '/')
  const filename = payload.filename ?? normalizedPath.split('/').at(-1) ?? ''
  const contentType = payload.contentType ?? 'application/octet-stream'

  if (normalizedPath !== pathname || normalizedPath.includes('..')) {
    throw new Error('Invalid upload path.')
  }
  if (!normalizedPath.startsWith('request-attachments/')) {
    throw new Error('Request attachments must use the request-attachments folder.')
  }
  if (!filename.trim()) {
    throw new Error('Request attachment filename is required.')
  }
  if (!REQUEST_ATTACHMENT_CONTENT_TYPES.includes(contentType)) {
    throw new Error('Request attachment file type is not supported.')
  }
  if (payload.sizeBytes && payload.sizeBytes > MAX_REQUEST_ATTACHMENT_BYTES) {
    throw new Error('Request attachments must be 100 MB or smaller.')
  }
}

export async function GET() {
  return Response.json({
    directUploadAvailable: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    maxSizeBytes: MAX_SPEC_PDF_BYTES,
    requestAttachmentMaxSizeBytes: MAX_REQUEST_ATTACHMENT_BYTES,
  })
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return Response.json(
        { error: 'Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN for the project Blob store.' },
        { status: 500 },
      )
    }

    const body = (await request.json()) as HandleUploadBody
    let session: Awaited<ReturnType<typeof getSession>> = null

    if (body.type === 'blob.generate-client-token') {
      const tokenBody = body as unknown as { payload?: { pathname?: unknown } }
      const requestedPath = typeof tokenBody.payload?.pathname === 'string'
        ? tokenBody.payload.pathname.replace(/\\/g, '/')
        : ''
      const isRequestAttachment = requestedPath.startsWith('request-attachments/')
      session = await getSession()
      if (!session && !isRequestAttachment) return Response.json({ error: 'Not authenticated.' }, { status: 401 })
    }

    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        const payload = parseClientPayload(clientPayload)
        const normalizedPath = pathname.replace(/\\/g, '/')
        const isRequestAttachment = normalizedPath.startsWith('request-attachments/')

        if (isRequestAttachment) {
          validateRequestAttachmentUpload(pathname, payload)
        } else {
          validateProjectSpecUpload(pathname, payload)
        }

        return {
          allowedContentTypes: isRequestAttachment ? REQUEST_ATTACHMENT_CONTENT_TYPES : ['application/pdf'],
          maximumSizeInBytes: isRequestAttachment ? MAX_REQUEST_ATTACHMENT_BYTES : MAX_SPEC_PDF_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            userId: session?.userId,
            pathname,
            multipart,
            filename: payload.filename,
          }),
        }
      },
    })

    return Response.json(result)
  } catch (error) {
    console.error('Blob upload token error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Blob upload failed.' },
      { status: 400 },
    )
  }
}
