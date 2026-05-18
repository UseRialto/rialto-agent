import { NextRequest, NextResponse } from 'next/server'
import { syncConnectedMailboxes } from '@/lib/mail/service'

function mailIngestAuthorized(request: NextRequest) {
  const secret = process.env.MAIL_INGEST_SECRET?.trim() || process.env.CRON_SECRET?.trim() || ''
  if (!secret && process.env.NODE_ENV !== 'production') return true
  if (!secret) return false
  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : request.headers.get('x-rialto-mail-token')?.trim()
  return token === secret
}

async function handle(request: NextRequest) {
  if (!mailIngestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized mailbox ingest request.' }, { status: 401 })
  }
  const forceFull = request.nextUrl.searchParams.get('forceFull') === '1'
  const provider = request.nextUrl.searchParams.get('provider')
  const result = await syncConnectedMailboxes({
    forceFull,
    provider: provider === 'google' || provider === 'microsoft_365' ? provider : undefined,
  })
  return NextResponse.json(result)
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
