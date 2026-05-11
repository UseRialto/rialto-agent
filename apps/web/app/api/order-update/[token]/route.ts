import { NextRequest, NextResponse } from 'next/server'
import { findReminderByToken, markReminderUsed } from '@/lib/order-reminders'
import { advanceOrderStageToAction } from '@/lib/actions/vendor'
import type { OrderStage } from '@/lib/types/vendor'

const VALID_STAGES: OrderStage[] = ['confirmed', 'packaged', 'shipped', 'out_for_delivery', 'delivered']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const reminder = await findReminderByToken(token)
  if (!reminder) {
    return NextResponse.json({ success: false, error: 'Invalid or expired link' }, { status: 401 })
  }

  let body: { targetStage?: unknown; notes?: unknown; carrier?: unknown; tracking_number?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
  }

  const { targetStage, notes, carrier, tracking_number } = body

  if (!targetStage || !VALID_STAGES.includes(targetStage as OrderStage)) {
    return NextResponse.json({ success: false, error: 'Invalid stage' }, { status: 400 })
  }

  const result = await advanceOrderStageToAction(
    reminder.order_id,
    targetStage as OrderStage,
    {
      notes: typeof notes === 'string' ? notes : undefined,
      carrier: typeof carrier === 'string' ? carrier : undefined,
      tracking_number: typeof tracking_number === 'string' ? tracking_number : undefined,
    },
  )

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }

  await markReminderUsed(reminder.id)

  return NextResponse.json({ success: true })
}
