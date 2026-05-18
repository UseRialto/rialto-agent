import { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'

const LOCAL_UPLOADS_ROOT = path.join(process.cwd(), '.local', 'uploads')
const RUNTIME_UPLOADS_ROOT = process.env.VERCEL
  ? path.join('/tmp', 'rialto', 'uploads')
  : LOCAL_UPLOADS_ROOT

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  csv: 'text/csv; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8',
  html: 'text/html; charset=utf-8',
  eml: 'message/rfc822',
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params
  const roots = [RUNTIME_UPLOADS_ROOT, LOCAL_UPLOADS_ROOT]

  for (const root of roots) {
    const filePath = path.join(root, ...segments)
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(path.resolve(root))) {
      return new Response('Forbidden', { status: 403 })
    }
    if (!fs.existsSync(resolved)) continue

    const buffer = fs.readFileSync(resolved)
    const ext = path.extname(resolved).slice(1).toLowerCase()
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

    return new Response(buffer, {
      headers: { 'Content-Type': contentType },
    })
  }

  return new Response('Not Found', { status: 404 })
}
