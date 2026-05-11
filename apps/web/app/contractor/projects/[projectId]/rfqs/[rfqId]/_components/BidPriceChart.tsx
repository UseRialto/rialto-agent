import type { ContractorBid } from '@/lib/types/contractor'

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${n.toLocaleString()}`
}

function isFullCoverage(bid: ContractorBid): boolean {
  return !bid.fulfillment_summary?.partial
}

function barColor(dec: string | null | undefined): string {
  if (dec === 'preferred') return '#1e3a2f'
  if (dec === 'alternate') return '#4a6358'
  if (dec === 'hold') return '#a85c2a'
  if (dec === 'do_not_use') return '#e8b4b4'
  return '#e2d9cf'
}

function PriceChart({ bids, decisions }: { bids: ContractorBid[]; decisions: Record<string, string> }) {
  if (bids.length === 0) return null
  const sorted = [...bids].sort((a, b) => a.total_price - b.total_price)
  const prices = bids.map((b) => b.total_price)
  const max = Math.max(...prices)
  const min = Math.min(...prices)
  const fullBids = bids.filter(isFullCoverage)
  const lowestId = fullBids.length
    ? fullBids.reduce((a, b) => (a.total_price < b.total_price ? a : b)).id
    : null

  const CHART_H = 140
  const BAR_W = 56
  const GAP = 20
  const PAD_L = 64
  const PAD_B = 44
  const PAD_T = 28
  const yTop = max * 1.25
  const totalW = PAD_L + sorted.length * (BAR_W + GAP) - GAP + 20
  const totalH = PAD_T + CHART_H + PAD_B

  return (
    <div className="flex-1 rounded-2xl p-5 shadow-sm" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Total Price</p>
          <p className="mt-0.5 text-sm font-semibold" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>Lowest to highest</p>
        </div>
        <div className="text-right">
          <p className="text-[10px]" style={{ color: '#8a9e96' }}>Range</p>
          <p className="text-sm font-bold" style={{ color: '#1e3a2f' }}>{fmt(min)} – {fmt(max)}</p>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${totalW} ${totalH}`} preserveAspectRatio="xMinYMin meet">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PAD_T + CHART_H - t * CHART_H
          return (
            <g key={t}>
              <line x1={PAD_L} y1={y} x2={totalW} y2={y} stroke="#e2d9cf" strokeWidth="1" />
              <text x={PAD_L - 8} y={y + 4} textAnchor="end" fontSize="9" fill="#8a9e96">
                {t === 0 ? '$0' : fmt(t * yTop)}
              </text>
            </g>
          )
        })}
        {sorted.map((bid, i) => {
          const barH = Math.max(4, (bid.total_price / yTop) * CHART_H)
          const x = PAD_L + i * (BAR_W + GAP)
          const y = PAD_T + CHART_H - barH
          const dec = decisions[bid.id] ?? bid.buyer_decision_status
          const isLowest = bid.id === lowestId
          return (
            <g key={bid.id}>
              <rect
                x={x} y={y} width={BAR_W} height={barH} rx="6"
                fill={barColor(dec)}
                opacity={bid.fulfillment_summary?.partial ? 0.5 : 1}
              />
              {isLowest && (
                <text x={x + BAR_W / 2} y={y - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fa6b04">
                  ★ lowest
                </text>
              )}
              <text x={x + BAR_W / 2} y={PAD_T + CHART_H + 16} textAnchor="middle" fontSize="10" fill="#1e3a2f" fontWeight="600">
                {bid.vendor_name.split(' ')[0]}
              </text>
              <text x={x + BAR_W / 2} y={PAD_T + CHART_H + 30} textAnchor="middle" fontSize="9" fill="#8a9e96">
                {fmt(bid.total_price)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function LeadTimeChart({ bids, decisions }: { bids: ContractorBid[]; decisions: Record<string, string> }) {
  if (bids.length === 0) return null
  const sorted = [...bids].sort((a, b) => a.lead_time_days - b.lead_time_days)
  const max = Math.max(...bids.map((b) => b.lead_time_days))
  const min = Math.min(...bids.map((b) => b.lead_time_days))

  const CHART_H = 140
  const BAR_W = 56
  const GAP = 20
  const PAD_L = 40
  const PAD_B = 44
  const PAD_T = 28
  const yTop = max * 1.25
  const totalW = PAD_L + sorted.length * (BAR_W + GAP) - GAP + 20
  const totalH = PAD_T + CHART_H + PAD_B

  return (
    <div className="flex-1 rounded-2xl p-5 shadow-sm" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Lead Time</p>
          <p className="mt-0.5 text-sm font-semibold" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>Fastest to slowest</p>
        </div>
        <div className="text-right">
          <p className="text-[10px]" style={{ color: '#8a9e96' }}>Range</p>
          <p className="text-sm font-bold" style={{ color: '#1e3a2f' }}>{min}d – {max}d</p>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${totalW} ${totalH}`} preserveAspectRatio="xMinYMin meet">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PAD_T + CHART_H - t * CHART_H
          return (
            <g key={t}>
              <line x1={PAD_L} y1={y} x2={totalW} y2={y} stroke="#e2d9cf" strokeWidth="1" />
              <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#8a9e96">
                {Math.round(t * yTop)}d
              </text>
            </g>
          )
        })}
        {sorted.map((bid, i) => {
          const barH = Math.max(4, (bid.lead_time_days / yTop) * CHART_H)
          const x = PAD_L + i * (BAR_W + GAP)
          const y = PAD_T + CHART_H - barH
          const dec = decisions[bid.id] ?? bid.buyer_decision_status
          const isFastest = sorted[0].id === bid.id
          return (
            <g key={bid.id}>
              <rect x={x} y={y} width={BAR_W} height={barH} rx="6" fill={barColor(dec)} />
              {isFastest && (
                <text x={x + BAR_W / 2} y={y - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fa6b04">
                  ⚡ fastest
                </text>
              )}
              <text x={x + BAR_W / 2} y={PAD_T + CHART_H + 16} textAnchor="middle" fontSize="10" fill="#1e3a2f" fontWeight="600">
                {bid.vendor_name.split(' ')[0]}
              </text>
              <text x={x + BAR_W / 2} y={PAD_T + CHART_H + 30} textAnchor="middle" fontSize="9" fill="#8a9e96">
                {bid.lead_time_days}d
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function BidPriceChart({
  bids,
  decisions,
}: {
  bids: ContractorBid[]
  decisions: Record<string, string>
}) {
  if (bids.length === 0) return null
  return (
    <div className="mb-6 flex gap-4">
      <PriceChart bids={bids} decisions={decisions} />
      <LeadTimeChart bids={bids} decisions={decisions} />
    </div>
  )
}
