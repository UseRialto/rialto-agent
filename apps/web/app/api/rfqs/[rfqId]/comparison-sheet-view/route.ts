import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getRFQById } from '@/lib/store/contractor-store'
import {
  getComparisonSheetVersionHistory,
  getComparisonSheetViewRecord,
  restoreComparisonSheetVersion,
  saveComparisonSheetView,
} from '@/lib/store/comparison-sheet-view-store'
import { normalizeComparisonSheetView } from '@/lib/procurement/comparison-sheet-state'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  const { rfqId } = await params
  const rfq = await getRFQById(rfqId)
  if (!rfq) return NextResponse.json({ error: 'RFQ not found.' }, { status: 404 })

  const record = await getComparisonSheetViewRecord(rfqId)
  const versions = await getComparisonSheetVersionHistory(rfqId)
  return NextResponse.json({
    rfqId,
    view: record.view,
    persisted: record.exists,
    currentVersionId: record.currentVersionId,
    versions,
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  const { rfqId } = await params
  const rfq = await getRFQById(rfqId)
  if (!rfq) return NextResponse.json({ error: 'RFQ not found.' }, { status: 404 })

  const body = await request.json().catch(() => null) as {
    view?: unknown
    metadata?: {
      source?: 'estimator-edit' | 'agent-proposal' | 'import' | 'vendor-merge' | 'restore' | 'system'
      summary?: string
      proposal?: unknown
    }
  } | null
  const view = normalizeComparisonSheetView(body?.view)
  const saved = await saveComparisonSheetView(rfqId, view, {
    ...body?.metadata,
    actorUserId: session.userId,
  })
  return NextResponse.json({ rfqId, ...saved })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  const { rfqId } = await params
  const rfq = await getRFQById(rfqId)
  if (!rfq) return NextResponse.json({ error: 'RFQ not found.' }, { status: 404 })

  const body = await request.json().catch(() => null) as { restoreVersionId?: unknown } | null
  if (typeof body?.restoreVersionId !== 'number') {
    return NextResponse.json({ error: 'restoreVersionId is required.' }, { status: 400 })
  }

  const restored = await restoreComparisonSheetVersion(rfqId, body.restoreVersionId, { actorUserId: session.userId })
  return NextResponse.json({ rfqId, ...restored })
}
