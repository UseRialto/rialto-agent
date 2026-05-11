import { NextRequest, NextResponse } from 'next/server'
import { getDueReminders, issueReminderToken } from '@/lib/order-reminders'
import { getContractorOrder } from '@/lib/store/contractor-store'
import { getProject } from '@/lib/store/contractor-store'
import { sendOrderReminderEmail } from '@/lib/mail/service'

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[order-reminders cron] CRON_SECRET is not set — refusing to run')
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? 'localhost:3000'
  const proto = request.headers.get('x-forwarded-proto') ?? 'http'
  const baseUrl = `${proto}://${host}`

  const due = await getDueReminders()

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const reminder of due) {
    try {
      const order = await getContractorOrder(reminder.order_id)
      if (!order) {
        skipped++
        continue
      }
      if (order.current_stage === 'delivered') {
        skipped++
        continue
      }

      const project = await getProject(order.project_id)
      if (!project) {
        skipped++
        continue
      }

      const rawToken = await issueReminderToken(reminder.id)

      await sendOrderReminderEmail({
        contractorUserId: project.owner_id,
        vendorEmail: reminder.vendor_email,
        vendorName: order.vendor_name,
        poNumber: order.po_number,
        rfqTitle: order.rfq_title,
        reminderIndex: reminder.reminder_index,
        expectedDeliveryDate: order.expected_delivery_date,
        rawToken,
        baseUrl,
      })

      sent++
    } catch (err) {
      console.error(`[order-reminders cron] Failed for reminder ${reminder.id}:`, err)
      failed++
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, failed })
}
