import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getRFQById, saveRFQ } from '@/lib/store/contractor-store'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  const { rfqId } = await params
  const body = await request.json().catch(() => null) as { title?: unknown } | null
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'title is required.' }, { status: 400 })

  const rfq = await getRFQById(rfqId)
  if (!rfq) return NextResponse.json({ error: 'RFQ not found.' }, { status: 404 })

  await saveRFQ({ ...rfq, title })
  return NextResponse.json({ rfqId, title })
}
