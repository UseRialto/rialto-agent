import { NextRequest, NextResponse } from 'next/server'
import { syncGoogleMailboxPushNotification } from '@/lib/mail/service'
import { decodeGoogleMailboxNotification } from '@/lib/mail/push-notification'

type PubSubPushBody = {
  message?: {
    data?: string
  }
}

function mailPushAuthorized(request: NextRequest) {
  const secret = process.env.MAIL_INGEST_SECRET?.trim() || ''
  if (!secret) return true
  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : request.headers.get('x-rialto-mail-token')?.trim()
  return token === secret
}

export async function POST(request: NextRequest) {
  if (!mailPushAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized mailbox push request.' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({})) as PubSubPushBody
  const notification = decodeGoogleMailboxNotification(body.message?.data ?? '')
  const result = await syncGoogleMailboxPushNotification(notification)
  return NextResponse.json(result)
}
