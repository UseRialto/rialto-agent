# Plan: Vendor Order Reminder Emails + Magic Link Status Updates

## Overview

When a PO is awarded, the system computes a delivery window from the vendor's bid lead time. Over that window, 4 automated reminder emails are sent to the awarded vendor, each containing a one-click magic link. The vendor opens the link (no login required) and updates the order's current stage. The contractor sees stage updates in their order tracking view.

---

## Problem

Today, once a PO is created the contractor has no structured mechanism to prompt vendors to self-report progress. Follow-up is manual and tracked only via free-text `follow_up_notes`. There is no vendor-side authenticated-less update path for off-platform vendors who may never create a Rialto account.

---

## Goals

1. Send 4 spaced reminder emails to the vendor over the lead time window after a PO is awarded.
2. Each email includes a unique, time-limited magic link.
3. Magic link opens a lightweight page (no login) where the vendor marks the current order stage and optionally adds notes / tracking info.
4. Stage updates are reflected immediately on the contractor's order detail page.
5. Work for both on-platform vendors (who have a `vendor_id`) and off-platform vendors (identified only by `vendor_email` from the bid).

---

## Non-Goals

- Full vendor portal access via the magic link (no bid history, no other orders).
- Two-way email reply parsing (that is the RFQ email sync flow).
- Push notifications or SMS.
- Changing the reminder schedule after PO award.

---

## Architecture

### Reminder Schedule

- Compute 4 reminder send-dates relative to `awarded_at` and `expected_delivery_date`:
  - Reminder 1: 25% of lead-time days after `awarded_at`
  - Reminder 2: 50% of lead-time days
  - Reminder 3: 75% of lead-time days
  - Reminder 4: On `expected_delivery_date` (or 1 day before if date has already passed)
- Minimum spacing: 1 day between reminders. If lead time < 4 days, stack at 1-day intervals from `awarded_at`.
- Reminders stop once the order reaches `delivered` stage.

### Data Model

**New table: `order_magic_links`**

```
order_magic_links
  id             serial PK
  order_id       text NOT NULL → orders.id (cascade delete)
  vendor_email   text NOT NULL
  token_hash     text NOT NULL UNIQUE   (SHA-256 of raw token)
  reminder_index integer NOT NULL       (1–4)
  send_at        text NOT NULL          (ISO date, when to send)
  sent_at        text                   (set when email dispatched)
  opened_at      text
  used_at        text                   (set on first submission)
  expires_at     text NOT NULL
  created_at     text NOT NULL
```

Unique constraint: `(order_id, reminder_index)` — one token per slot per order.

**`orders` schema additions** (new columns):
- `vendor_email text` — copy from bid at award time so reminders can reach off-platform vendors without an extra join.

### Scheduling (Vercel Cron)

Add a Vercel Cron route at `/api/cron/order-reminders` that runs **daily at 08:00 UTC**.

Logic:
1. Query `order_magic_links` where `send_at <= today`, `sent_at IS NULL`, and the parent order `current_stage != 'delivered'`.
2. For each row, generate a fresh raw token (store new hash in place), compose email, send via contractor's connected mailbox (fall back to a no-reply transactional address if no mailbox).
3. Mark `sent_at = now()`.

Cron config in `vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/order-reminders", "schedule": "0 8 * * *" }]
}
```

Secure the route with `CRON_SECRET` header check (Vercel injects this automatically for cron invocations).

### Token Generation & Validation

Follow the same pattern as `rfq_magic_links`:
- Raw token = `crypto.randomUUID()` + `crypto.randomUUID()` joined, URL-safe.
- Stored value = `sha256(rawToken)` (hex).
- Link: `https://<host>/vendor/order-update/<rawToken>`
- Token expires 72 hours after `send_at` (or at `expected_delivery_date + 3 days`, whichever is later).

### Magic Link Page

**Route:** `app/vendor/order-update/[token]/page.tsx`
No authentication middleware; the token IS the credential.

On load:
1. Hash the token, look up `order_magic_links` by `token_hash`.
2. Validate: not expired, not revoked, order not yet delivered.
3. Load the order (read-only, join `orders` for line items snapshot, PO number, vendor name).
4. Render a simple stage-update form.

Form fields:
- Current stage selector (only stages ≥ current stage are selectable): `confirmed → packaged → shipped → out_for_delivery → delivered`
- Notes (optional text area)
- If stage = `shipped`: carrier name + tracking number fields
- Submit button

On submit (`POST /api/order-update/[token]`):
1. Validate token again (race-safe).
2. Call `advanceOrderStageToAction(orderId, newStage, { notes, carrier, tracking_number })` — a new variant of `advanceOrderStageAction` that accepts an explicit target stage rather than always incrementing by one.
3. Mark `order_magic_links.used_at = now()`.
4. Show a success confirmation page (no redirect back to the portal).

### Email Template

Subject: `[Reminder {n}/4] Order {PO#} update requested — {RFQ title}`

Body (plain HTML, sent from contractor's mailbox):
- Greeting to vendor
- PO number, line-item summary from `line_items_snapshot`
- Expected delivery date
- CTA button: "Update Order Status" → magic link
- Link expiry notice

### Integration Points

**`awardPOAction` / `createTrackingOrdersForAllocations`** (in `lib/actions/contractor.ts`):
- After `saveContractorOrder(order)`, call `scheduleOrderReminders(order, vendorEmail)`.
- `vendorEmail` is sourced from `bid.vendor_email` (for off-platform) or looked up from `users` by `bid.vendor_id` (for on-platform).

**`scheduleOrderReminders(order, vendorEmail)`** (new, `lib/order-reminders.ts`):
- Computes the 4 send dates.
- Inserts 4 rows into `order_magic_links` with `sent_at = NULL`.
- Does NOT send emails immediately; cron handles dispatch.

**`advanceOrderStageAction`** — add a new sibling `advanceOrderStageToAction(orderId, targetStage, data)` in `lib/actions/vendor.ts` that validates the target stage is ≥ current and ≤ one beyond (or fully delivered), then calls `saveOrder`.

---

## File Checklist

| File | Change |
|------|--------|
| `lib/db/schema.ts` | Add `orderMagicLinks` table; add `vendor_email` column to `orders` |
| `lib/order-reminders.ts` | New: `scheduleOrderReminders`, `sendDueOrderReminders` |
| `lib/actions/contractor.ts` | Call `scheduleOrderReminders` inside `createTrackingOrdersForAllocations` and `awardPOAction` |
| `lib/actions/vendor.ts` | Add `advanceOrderStageToAction` |
| `app/vendor/order-update/[token]/page.tsx` | New: magic link landing page (server component, loads order) |
| `app/vendor/order-update/[token]/_components/OrderUpdateForm.tsx` | New: stage-update form (client component) |
| `app/api/order-update/[token]/route.ts` | New: POST handler for stage update submission |
| `app/api/cron/order-reminders/route.ts` | New: daily cron handler |
| `vercel.json` | Add cron entry |
| `pnpm db:generate` + `pnpm db:migrate` | Apply schema migration |

---

## Open Questions

1. **Mailbox fallback**: If the contractor has no connected mailbox, should reminders be skipped silently, queued until a mailbox is connected, or sent from a platform transactional address? Recommendation: send from a transactional address (requires `SMTP_*` env vars) as a fallback; log a warning.
2. **Token re-use vs. single-use**: Should each reminder link be single-use (invalidated after first submit) or allow multiple submissions (vendor corrects a mistake)? Recommendation: allow re-submission within the expiry window, but track `used_at` for the first use.
3. **Off-platform vendor email source**: `bid.vendor_email` may be blank for on-platform bids. Confirm that `users.email` is always populated for registered vendors and use that as fallback.
4. **Minimum lead time**: Orders with `lead_time_days = 0` (e.g., immediate pickup) should skip scheduled reminders or send a single same-day notification. Define threshold (e.g., < 2 days → send 1 immediate notification).
5. **Cron secret**: `CRON_SECRET` must be set in Vercel project settings before deploying cron route.

---

## Implementation Sequence

1. Schema migration: `orderMagicLinks` table + `orders.vendor_email` column.
2. `lib/order-reminders.ts` — `scheduleOrderReminders` function.
3. Wire into `awardPOAction` / `createTrackingOrdersForAllocations`.
4. `advanceOrderStageToAction` in vendor actions.
5. Magic link page + API route.
6. Email template in `lib/mail/service.ts` (new `sendOrderReminderEmail` function).
7. Cron route + `vercel.json`.
8. End-to-end test: award PO → verify 4 rows in `order_magic_links` → simulate cron run → visit link → submit stage → verify order updated.
