import type { ContractorBid } from '@/lib/types/contractor'

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${n.toLocaleString()}`
}

export function BidSummaryCards({ bids }: { bids: ContractorBid[] }) {
  const fullCoverageBids = bids.filter((bid) => !bid.fulfillment_summary?.partial && (bid.fulfillment_summary?.coverage_ratio ?? 1) >= 1)
  const lowestBid = fullCoverageBids.length > 0
    ? fullCoverageBids.reduce((min, b) => (b.total_price < min.total_price ? b : min), fullCoverageBids[0])
    : null
  const fastestBid = bids.reduce((min, b) => (b.lead_time_days < min.lead_time_days ? b : min), bids[0])
  const invitedCount = bids.filter((b) => b.is_invited).length
  const completeCount = fullCoverageBids.length
  const partialCount = bids.length - completeCount
  const bestValueBid = lowestBid ?? bids.slice().sort((a, b) => a.total_price - b.total_price)[0]

  return (
    <div className="mb-6 grid gap-3 md:grid-cols-4">
      <div className="rounded-2xl p-4" style={{ background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#8a9e96' }}>Start Here</p>
        <p className="mt-1.5 text-xl font-bold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>
          {bestValueBid ? bestValueBid.vendor_name : 'No quote selected'}
        </p>
        <p className="mt-1 text-xs" style={{ color: '#4a6358' }}>
          {lowestBid
            ? `Lowest complete bid at ${fmt(lowestBid.total_price)} with ${lowestBid.lead_time_days} day lead time.`
            : 'No vendor covers the full order yet. Review partial quotes before awarding.'}
        </p>
      </div>
      <div className="rounded-2xl p-4" style={{ background: '#e8f4ee', border: '1px solid #a8d5ba', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#2d6a4f' }}>Lowest Complete</p>
        {lowestBid ? (
          <>
            <p className="mt-1.5 text-xl font-bold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>{fmt(lowestBid.total_price)}</p>
            <p className="mt-0.5 truncate text-xs" style={{ color: '#2d6a4f' }}>{lowestBid.vendor_name}</p>
          </>
        ) : (
          <>
            <p className="mt-1.5 text-xl font-bold" style={{ color: '#a85c2a' }}>No full quote</p>
            <p className="mt-0.5 text-xs" style={{ color: '#a85c2a' }}>Lowest price hidden until quantity is covered.</p>
          </>
        )}
      </div>
      <div className="rounded-2xl p-4" style={{ background: '#fdf0e8', border: '1px solid #e8c4a0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#a85c2a' }}>Fastest</p>
        <p className="mt-1.5 text-xl font-bold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#a85c2a' }}>{fastestBid.lead_time_days} days</p>
        <p className="mt-0.5 truncate text-xs" style={{ color: '#a85c2a' }}>{fastestBid.vendor_name}</p>
      </div>
      <div className="rounded-2xl p-4" style={{ background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#8a9e96' }}>Coverage</p>
        <p className="mt-1.5 text-xl font-bold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>{completeCount}/{bids.length} complete</p>
        <p className="mt-0.5 text-xs" style={{ color: '#4a6358' }}>{partialCount} partial · {invitedCount} invited</p>
      </div>
    </div>
  )
}
