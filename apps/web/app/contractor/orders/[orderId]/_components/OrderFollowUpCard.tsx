'use client'

import { useState, useTransition } from 'react'
import { Check, Clock, Flame, Save } from 'lucide-react'
import { updateOrderFollowUpAction } from '@/lib/actions/contractor'

interface Props {
  orderId: string
  orderedAt?: string
  expectedDeliveryDate?: string
  nextFollowUpDate?: string
  followUpStatus?: 'on_track' | 'needs_follow_up' | 'escalated' | 'complete'
  followUpNotes?: string
}

export function OrderFollowUpCard(props: Props) {
  const [isPending, startTransition] = useTransition()
  const [orderedAt, setOrderedAt] = useState(props.orderedAt ?? '')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(props.expectedDeliveryDate ?? '')
  const [nextFollowUpDate, setNextFollowUpDate] = useState(props.nextFollowUpDate ?? '')
  const [followUpStatus, setFollowUpStatus] = useState<Props['followUpStatus']>(props.followUpStatus ?? 'on_track')
  const [followUpNotes, setFollowUpNotes] = useState(props.followUpNotes ?? '')
  const statuses = [
    { value: 'on_track', label: 'On Track', Icon: Check },
    { value: 'needs_follow_up', label: 'Follow Up', Icon: Clock },
    { value: 'escalated', label: 'Escalated', Icon: Flame },
    { value: 'complete', label: 'Complete', Icon: Check },
  ] as const

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: '#1e3a2f' }}>Follow-Up Tracker</h2>
          <p className="mt-1 text-xs" style={{ color: '#8a9e96' }}>
            Keep the next vendor check-in and delivery risk visible.
          </p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => {
            await updateOrderFollowUpAction(props.orderId, {
              orderedAt,
              expectedDeliveryDate,
              nextFollowUpDate,
              followUpStatus,
              followUpNotes,
            })
          })}
          className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          style={{ background: '#1e3a2f' }}
        >
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
          {isPending ? 'Saving…' : 'Save Follow-Up'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Ordered Date</label>
          <input
            type="date"
            value={orderedAt}
            onChange={(e) => setOrderedAt(e.target.value)}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
            style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Expected Delivery</label>
          <input
            type="date"
            value={expectedDeliveryDate}
            onChange={(e) => setExpectedDeliveryDate(e.target.value)}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
            style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Next Follow-Up</label>
          <input
            type="date"
            value={nextFollowUpDate}
            onChange={(e) => setNextFollowUpDate(e.target.value)}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
            style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}
          />
        </div>
        <div className="sm:col-span-2">
          <p className="mb-2 text-xs font-medium" style={{ color: '#4a6358' }}>Follow-Up Status</p>
          <div className="grid grid-cols-2 gap-2">
            {statuses.map(({ value, label, Icon }) => {
              const active = followUpStatus === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFollowUpStatus(value)}
                  className="inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors"
                  style={active
                    ? { borderColor: '#1e3a2f', background: '#1e3a2f', color: '#ffffff' }
                    : { borderColor: '#e2d9cf', background: '#ffffff', color: '#4a6358' }}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Follow-Up Notes</label>
          <textarea
            rows={3}
            value={followUpNotes}
            onChange={(e) => setFollowUpNotes(e.target.value)}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
            style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}
            placeholder="Next action, phone call outcome, delivery concern, or escalation note…"
          />
        </div>
      </div>
    </div>
  )
}
