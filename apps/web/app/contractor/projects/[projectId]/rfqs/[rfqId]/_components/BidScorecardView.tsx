'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ContractorBid, ContractorRFQ } from '@/lib/types/contractor'
import { awardPOAction, updateBidDecisionAction } from '@/lib/actions/contractor'

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${n.toLocaleString()}`
}

function isFullCoverage(bid: ContractorBid) {
  return !bid.fulfillment_summary?.partial && (bid.fulfillment_summary?.coverage_ratio ?? 1) >= 1
}

// ─── sub-components ──────────────────────────────────────────────────────────

const DECISION_CONFIG = {
  preferred:  { label: 'Preferred', bg: '#1e3a2f', text: '#ffffff', activeBorder: 'transparent' },
  alternate:  { label: 'Alternate', bg: '#4a6358', text: '#ffffff', activeBorder: 'transparent' },
  hold:       { label: 'Hold',      bg: '#fdf0e8', text: '#a85c2a', activeBorder: '#e8c4a0' },
  do_not_use: { label: 'Pass',      bg: '#fdeaea', text: '#c0392b', activeBorder: '#f5c6c6' },
} as const

type DecisionStatus = keyof typeof DECISION_CONFIG

function CoverageBadge({ bid }: { bid: ContractorBid }) {
  const full = isFullCoverage(bid)
  const pct = Math.round((bid.fulfillment_summary?.coverage_ratio ?? 1) * 100)
  if (full) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{ background: '#e8f4ee', color: '#2d6a4f', outline: '1px solid #a8d5ba' }}>
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Full Quote
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: '#fdf0e8', color: '#a85c2a', outline: '1px solid #e8c4a0' }}>
      ⚠ Partial · {pct}%
    </span>
  )
}

function SourceBadge({ bid }: { bid: ContractorBid }) {
  if (bid.source === 'email')
    return <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: '#ede8e2', color: '#8a9e96' }}>Email</span>
  if (bid.source === 'magic_form')
    return <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: '#fff3eb', color: '#fa6b04' }}>Magic Form</span>
  if (bid.is_invited)
    return <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: '#fdf0e8', color: '#a85c2a' }}>Invited</span>
  return <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: '#ede8e2', color: '#8a9e96' }}>Marketplace</span>
}

// ─── LineItemDrawer ───────────────────────────────────────────────────────────

function LineItemDrawer({
  bid,
  rfq,
  rfqId,
  demoMode,
  onClose,
}: {
  bid: ContractorBid
  rfq: ContractorRFQ
  rfqId: string
  demoMode: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [awarding, setAwarding] = useState(false)
  const [awardError, setAwardError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleAward() {
    setAwarding(true)
    setAwardError('')
    const result = await awardPOAction(rfqId, bid.id)
    if (!result.success) {
      setAwardError(result.error ?? 'Failed to award PO.')
      setAwarding(false)
      return
    }
    onClose()
    router.refresh()
  }

  const canAward = !demoMode && bid.source !== 'email' && bid.status !== 'awarded' && bid.status !== 'rejected'

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/30" />
      <aside
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #e2d9cf', background: '#ede8e2' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Line Items</p>
            <h3 className="mt-1 text-xl font-bold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>{bid.vendor_name}</h3>
            <div className="mt-2 flex items-center gap-2">
              <CoverageBadge bid={bid} />
              <span className="text-sm font-semibold" style={{ color: '#4a6358' }}>{bid.lead_time_days}d lead</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{ border: '1px solid #e2d9cf', color: '#4a6358' }}
          >
            Close ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 text-[10px] font-semibold uppercase tracking-wider" style={{ background: '#ede8e2', color: '#8a9e96' }}>
              <tr>
                <th className="px-5 py-3 text-left">Item</th>
                <th className="px-3 py-3 text-right">Req&apos;d</th>
                <th className="px-3 py-3 text-right">Unit $</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3 text-right">Lead</th>
                <th className="px-3 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rfq.line_items.map((item) => {
                const resp = bid.line_item_responses.find((r) => r.line_item_id === item.id)
                const unavail = !resp || resp.availability === 'unavailable'
                return (
                  <tr key={item.id} className="transition-colors" style={{ borderBottom: '1px solid #e2d9cf', opacity: unavail ? 0.5 : 1 }}>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold" style={{ color: '#1e3a2f' }}>{item.description}</p>
                      {item.sku && <p className="mt-0.5 text-[10px]" style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: '#8a9e96' }}>{item.sku}</p>}
                    </td>
                    <td className="px-3 py-3.5 text-right text-xs" style={{ color: '#4a6358' }}>{item.quantity} {item.unit}</td>
                    <td className="px-3 py-3.5 text-right font-semibold" style={{ color: '#1e3a2f' }}>{!unavail ? fmt(resp!.unit_price) : '—'}</td>
                    <td className="px-3 py-3.5 text-right font-bold" style={{ color: '#1e3a2f' }}>{!unavail ? fmt(resp!.total_price) : '—'}</td>
                    <td className="px-3 py-3.5 text-right" style={{ color: '#4a6358' }}>{!unavail ? `${resp!.lead_time_days}d` : '—'}</td>
                    <td className="px-3 py-3.5">
                      {unavail ? (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#fdeaea', color: '#8b2e2e' }}>Unavailable</span>
                      ) : resp?.availability === 'can_source' ? (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#fdf0e8', color: '#a85c2a' }}>Needs sourcing</span>
                      ) : (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#e8f4ee', color: '#2d6a4f' }}>In stock</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4" style={{ borderTop: '1px solid #e2d9cf', background: '#ede8e2' }}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: '#4a6358' }}>Total</span>
            <span className="text-2xl font-bold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>{fmt(bid.total_price)}</span>
          </div>
          {awardError && <p className="mb-2 text-xs" style={{ color: '#a85c2a' }}>{awardError}</p>}
          {bid.status === 'awarded' ? (
            <div className="rounded-xl py-2.5 text-center text-sm font-semibold" style={{ background: '#e8f4ee', color: '#2d6a4f' }}>Awarded</div>
          ) : bid.source === 'email' ? (
            <div className="rounded-xl py-2.5 text-center text-xs font-semibold" style={{ background: '#ede8e2', color: '#8a9e96' }}>Email quote — compare only</div>
          ) : canAward && !showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all"
              style={{ background: '#1e3a2f' }}
            >
              Award PO to {bid.vendor_name}
            </button>
          ) : showConfirm ? (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: '#4a6358' }}>Confirm: create tracking order for <strong>{bid.vendor_name}</strong> — {fmt(bid.total_price)}?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleAward}
                  disabled={awarding}
                  className="flex-1 rounded-xl py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                  style={{ background: '#1e3a2f' }}
                >
                  {awarding ? 'Processing…' : 'Confirm'}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 rounded-xl py-2 text-sm font-semibold transition-colors"
                  style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

// ─── BidCard ─────────────────────────────────────────────────────────────────

function BidCard({
  bid,
  allBids,
  decisionStatus,
  onDecision,
  onOpenDrawer,
  demoMode,
}: {
  bid: ContractorBid
  allBids: ContractorBid[]
  decisionStatus: ContractorBid['buyer_decision_status']
  onDecision: (status: DecisionStatus) => void
  onOpenDrawer: (bid: ContractorBid) => void
  demoMode: boolean
}) {
  const isPartial = !!bid.fulfillment_summary?.partial
  const isPreferred = decisionStatus === 'preferred'

  const lowestFull = allBids.filter(isFullCoverage).sort((a, b) => a.total_price - b.total_price)[0]
  const isLowest = lowestFull?.id === bid.id
  const isFastest = allBids.slice().sort((a, b) => a.lead_time_days - b.lead_time_days)[0]?.id === bid.id

  const topBarGradient =
    decisionStatus === 'preferred' ? `linear-gradient(90deg, #1e3a2f, #fa6b04)` :
    decisionStatus === 'alternate' ? '#4a6358' :
    decisionStatus === 'hold'      ? '#a85c2a' :
    decisionStatus === 'do_not_use'? '#e8b4b4'  : `linear-gradient(90deg, #fa6b04, #e2d9cf)`

  const lineItemCount = bid.line_item_responses.length

  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      style={{
        background: '#ffffff',
        border: `1px solid ${isPreferred ? '#1e3a2f' : '#e2d9cf'}`,
        outline: isPreferred ? '2px solid #ede8e2' : 'none',
      }}
    >
      {/* Color bar */}
      <div className="h-1 w-full" style={{ background: topBarGradient }} />

      <div className="flex flex-col gap-4 p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3
              className="text-base font-bold leading-tight"
              style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}
            >
              {bid.vendor_name}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <SourceBadge bid={bid} />
              {bid.designer_name && <span className="text-[10px]" style={{ color: '#8a9e96' }}>{bid.designer_name}</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {isLowest && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#fa6b04', color: '#ffffff' }}>★ Best Value</span>
            )}
            {isFastest && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#a85c2a', color: '#ffffff' }}>⚡ Fastest</span>
            )}
          </div>
        </div>

        {/* Price + Lead (2-col) */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl px-4 py-3" style={{ background: isPreferred ? '#f0f4f1' : '#ede8e2' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Total Price</p>
            <p
              className="mt-1 text-2xl font-bold leading-none"
              style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: isPartial ? '#a85c2a' : isPreferred ? '#1e3a2f' : '#1e3a2f' }}
            >
              {fmt(bid.total_price)}
            </p>
          </div>
          <div className="rounded-xl px-4 py-3" style={{ background: '#ede8e2' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Lead Time</p>
            <p className="mt-1 text-2xl font-bold leading-none" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: isFastest ? '#a85c2a' : '#1e3a2f' }}>
              {bid.lead_time_days}<span className="text-sm font-semibold" style={{ color: '#8a9e96' }}>d</span>
            </p>
          </div>
        </div>

        {/* Quote status */}
        <div className="flex flex-wrap items-center gap-2">
          <CoverageBadge bid={bid} />
          {bid.terms?.payment_terms && (
            <span className="rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ border: '1px solid #e2d9cf', color: '#4a6358' }}>
              {bid.terms.payment_terms}
            </span>
          )}
        </div>

        {/* Compliance & risk flags */}
        {((bid.compliance_declarations?.length ?? 0) > 0 || (bid.risk_flags?.length ?? 0) > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {bid.compliance_declarations?.map((d) => (
              <span key={d.code} className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#e8f4ee', color: '#2d6a4f' }}>✓ {d.label}</span>
            ))}
            {bid.risk_flags?.map((f) => (
              <span key={f.code} className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#fdf0e8', color: '#a85c2a' }}>⚠ {f.label}</span>
            ))}
          </div>
        )}

        {/* Decision strip */}
        {!demoMode && (
          <div className="grid grid-cols-4 gap-1 pt-1">
            {(Object.keys(DECISION_CONFIG) as DecisionStatus[]).map((status) => {
              const cfg = DECISION_CONFIG[status]
              const active = decisionStatus === status
              return (
                <button
                  key={status}
                  onClick={() => onDecision(status)}
                  className="rounded-lg py-2 text-[10px] font-bold transition-all"
                  style={active
                    ? { background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.activeBorder}` }
                    : { background: 'transparent', color: '#8a9e96', border: '1px solid #e2d9cf' }
                  }
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Rationale */}
        {bid.decision_rationale && (
          <p className="line-clamp-2 text-[11px] italic leading-relaxed" style={{ color: '#8a9e96' }}>
            &ldquo;{bid.decision_rationale}&rdquo;
          </p>
        )}

        {/* CTA */}
        <button
          onClick={() => onOpenDrawer(bid)}
          className="mt-1 w-full rounded-xl py-2 text-xs font-semibold transition-colors hover:bg-[#ede8e2]"
          style={{ border: '1px solid #e2d9cf', color: '#4a6358' }}
        >
          View {lineItemCount} line item{lineItemCount !== 1 ? 's' : ''} →
        </button>
      </div>
    </div>
  )
}

// ─── SummaryBar ───────────────────────────────────────────────────────────────

function SummaryBar({ bids }: { bids: ContractorBid[] }) {
  const fullBids = bids.filter(isFullCoverage)
  const lowest = fullBids.slice().sort((a, b) => a.total_price - b.total_price)[0]
  const fastest = bids.slice().sort((a, b) => a.lead_time_days - b.lead_time_days)[0]
  const completePct = bids.length > 0 ? Math.round((fullBids.length / bids.length) * 100) : 0

  const stats = [
    { label: 'Quotes received',   value: String(bids.length),                          sub: `${fullBids.length} complete`,       color: '#1e3a2f' },
    { label: 'Lowest complete', value: lowest ? fmt(lowest.total_price) : 'None',    sub: lowest?.vendor_name ?? 'No full quote', color: '#2d6a4f' },
    { label: 'Fastest lead',    value: fastest ? `${fastest.lead_time_days}d` : '—', sub: fastest?.vendor_name ?? '',           color: '#a85c2a' },
    { label: 'Full coverage',   value: `${completePct}%`,                             sub: `${fullBids.length}/${bids.length} vendors`, color: '#1e3a2f' },
  ]

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl p-4 shadow-sm" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#8a9e96' }}>{s.label}</p>
          <p className="mt-1.5 text-2xl font-bold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: s.color }}>{s.value}</p>
          <p className="mt-0.5 truncate text-xs" style={{ color: '#4a6358' }}>{s.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function BidScorecardView({
  rfq,
  bids,
  demoMode = false,
}: {
  rfq: ContractorRFQ
  bids: ContractorBid[]
  demoMode?: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [drawerBid, setDrawerBid] = useState<ContractorBid | null>(null)
  const [sortBy, setSortBy] = useState<'price' | 'lead' | 'decision'>('price')
  const [decisionStatuses, setDecisionStatuses] = useState<Record<string, ContractorBid['buyer_decision_status']>>({})

  const effectiveDecision = (bid: ContractorBid) =>
    decisionStatuses[bid.id] ?? bid.buyer_decision_status

  function handleDecision(bid: ContractorBid, status: DecisionStatus) {
    if (demoMode) return
    const next = effectiveDecision(bid) === status ? undefined : status
    setDecisionStatuses((prev) => ({ ...prev, [bid.id]: next }))
    startTransition(async () => {
      await updateBidDecisionAction(rfq.id, bid.id, { buyerDecisionStatus: next ?? null })
      router.refresh()
    })
  }

  const sortedBids = useMemo(() => {
    const decisionOrder: Record<string, number> = { preferred: 0, alternate: 1, hold: 2, do_not_use: 3 }
    return [...bids].sort((a, b) => {
      if (sortBy === 'price') return a.total_price - b.total_price
      if (sortBy === 'lead') return a.lead_time_days - b.lead_time_days
      const da = effectiveDecision(a) ?? 'unset'
      const db = effectiveDecision(b) ?? 'unset'
      return (decisionOrder[da] ?? 4) - (decisionOrder[db] ?? 4)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bids, sortBy, decisionStatuses])

  return (
    <div className="rounded-2xl p-5" style={{ background: '#f5f0eb' }}>
      <SummaryBar bids={bids} />

      {/* Sort controls */}
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: '#4a6358' }}>
          {bids.length} quotes · <span style={{ color: '#8a9e96' }}>{bids.filter(isFullCoverage).length} full quotes</span>
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: '#8a9e96' }}>Sort</span>
          <div className="flex rounded-xl p-0.5 shadow-sm" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
            {([['price', 'Price'], ['lead', 'Lead time'], ['decision', 'Decision']] as const).map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setSortBy(val)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
                style={sortBy === val
                  ? { background: '#1e3a2f', color: '#ffffff' }
                  : { color: '#8a9e96' }
                }
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bid card grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {sortedBids.map((bid) => (
          <BidCard
            key={bid.id}
            bid={bid}
            allBids={bids}
            decisionStatus={effectiveDecision(bid)}
            onDecision={(status) => handleDecision(bid, status)}
            onOpenDrawer={setDrawerBid}
            demoMode={demoMode}
          />
        ))}
      </div>

      {/* Line item drawer */}
      {drawerBid && (
        <LineItemDrawer
          bid={drawerBid}
          rfq={rfq}
          rfqId={rfq.id}
          demoMode={demoMode}
          onClose={() => setDrawerBid(null)}
        />
      )}
    </div>
  )
}
