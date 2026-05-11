import crypto from 'crypto'
import { eq, and, lte, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { orderMagicLinks, orders } from '@/lib/db/schema'
import type { ContractorOrder } from '@/lib/types/contractor'

const REMINDER_COUNT = 4

function dateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

// Returns YYYY-MM-DD strings for the 4 reminder send dates.
// Reminders are spaced at 25/50/75/100% of the lead-time window.
// Minimum 1 day gap between reminders; first reminder no earlier than award + 1 day.
function computeSendDates(awardedAt: string, expectedDeliveryDate: string): string[] {
  const start = new Date(awardedAt)
  const end = new Date(expectedDeliveryDate)
  const totalMs = end.getTime() - start.getTime()
  const totalDays = Math.max(1, Math.round(totalMs / 86_400_000))

  const dates: string[] = []
  for (let i = 1; i <= REMINDER_COUNT; i++) {
    const fraction = i / REMINDER_COUNT
    const rawDays = Math.round(totalDays * fraction)
    // Ensure minimum 1-day spacing from previous reminder
    const minDays = (dates.length === 0 ? 1 : Math.round(totalDays * ((i - 1) / REMINDER_COUNT)) + 1)
    const days = Math.max(rawDays, minDays)
    dates.push(dateOnlyString(addDays(start, days)))
  }
  return dates
}

function computeExpiry(sendAt: string, expectedDeliveryDate: string): string {
  const sendDate = new Date(sendAt)
  const deliveryDate = new Date(expectedDeliveryDate)
  // Expire 72h after send_at or 3 days after expected delivery, whichever is later
  const fromSend = addDays(sendDate, 3)
  const fromDelivery = addDays(deliveryDate, 3)
  const expiry = fromSend > fromDelivery ? fromSend : fromDelivery
  return expiry.toISOString()
}

function generateToken(): { raw: string; hash: string } {
  const raw = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  return { raw, hash }
}

export async function scheduleOrderReminders(order: ContractorOrder, vendorEmail: string): Promise<void> {
  if (!order.expected_delivery_date || !vendorEmail) return

  const sendDates = computeSendDates(order.awarded_at, order.expected_delivery_date)
  const now = new Date().toISOString()

  const rows = sendDates.map((sendAt, i) => {
    const { hash } = generateToken()
    return {
      order_id: order.id,
      vendor_email: vendorEmail,
      token_hash: hash,
      reminder_index: i + 1,
      send_at: sendAt,
      sent_at: null as string | null,
      opened_at: null as string | null,
      used_at: null as string | null,
      expires_at: computeExpiry(sendAt, order.expected_delivery_date!),
      created_at: now,
    }
  })

  // Insert all rows, skipping conflicts (idempotent on re-award edge cases)
  await db.insert(orderMagicLinks).values(rows).onConflictDoNothing()
}

export type DueReminder = {
  id: number
  order_id: string
  vendor_email: string
  reminder_index: number
  send_at: string
  expires_at: string
  // Raw token is not stored; we regenerate and update the hash on send
}

// Returns all unsent reminders due on or before today for orders that aren't delivered.
export async function getDueReminders(): Promise<DueReminder[]> {
  const today = dateOnlyString(new Date())

  const rows = await db
    .select({
      id: orderMagicLinks.id,
      order_id: orderMagicLinks.order_id,
      vendor_email: orderMagicLinks.vendor_email,
      reminder_index: orderMagicLinks.reminder_index,
      send_at: orderMagicLinks.send_at,
      expires_at: orderMagicLinks.expires_at,
      current_stage: orders.current_stage,
    })
    .from(orderMagicLinks)
    .innerJoin(orders, eq(orderMagicLinks.order_id, orders.id))
    .where(
      and(
        lte(orderMagicLinks.send_at, today),
        isNull(orderMagicLinks.sent_at),
      )
    )

  // Filter out orders that are already delivered
  return rows
    .filter((r) => r.current_stage !== 'delivered')
    .map(({ current_stage: _stage, ...r }) => r)
}

// Generates a fresh token for the reminder row, persists the new hash, returns the raw token.
export async function issueReminderToken(reminderId: number): Promise<string> {
  const { raw, hash } = generateToken()
  await db
    .update(orderMagicLinks)
    .set({ token_hash: hash, sent_at: new Date().toISOString() })
    .where(eq(orderMagicLinks.id, reminderId))
  return raw
}

// Looks up a reminder by raw token. Returns null if not found or expired.
export async function findReminderByToken(rawToken: string): Promise<{
  id: number
  order_id: string
  vendor_email: string
  reminder_index: number
  expires_at: string
  opened_at: string | null
  used_at: string | null
} | null> {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const rows = await db
    .select()
    .from(orderMagicLinks)
    .where(eq(orderMagicLinks.token_hash, hash))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  if (new Date(row.expires_at) < new Date()) return null

  return {
    id: row.id,
    order_id: row.order_id,
    vendor_email: row.vendor_email,
    reminder_index: row.reminder_index,
    expires_at: row.expires_at,
    opened_at: row.opened_at,
    used_at: row.used_at,
  }
}

export async function markReminderOpened(reminderId: number): Promise<void> {
  await db
    .update(orderMagicLinks)
    .set({ opened_at: new Date().toISOString() })
    .where(and(eq(orderMagicLinks.id, reminderId), isNull(orderMagicLinks.opened_at)))
}

export async function markReminderUsed(reminderId: number): Promise<void> {
  await db
    .update(orderMagicLinks)
    .set({ used_at: new Date().toISOString() })
    .where(and(eq(orderMagicLinks.id, reminderId), isNull(orderMagicLinks.used_at)))
}
