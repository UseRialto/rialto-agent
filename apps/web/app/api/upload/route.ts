import { NextRequest } from 'next/server'
import { saveUploadedFile } from '@/lib/files/upload'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const orderId = formData.get('orderId') as string | null
    const folder = formData.get('folder') as string | null

    if (!file || (!orderId && !folder)) {
      return Response.json({ error: 'Missing file destination' }, { status: 400 })
    }

    const result = await saveUploadedFile({ file, folder: folder ?? orderId ?? '' })
    return Response.json({ url: result.url, filename: result.filename, mimeType: result.mimeType, sizeBytes: result.sizeBytes })
  } catch (err) {
    console.error('Upload error:', err)
    return Response.json({ error: 'Upload failed' }, { status: 500 })
  }
}
