import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { getSubmittedBid } from '@/lib/api/vendor'
import { getContractorRFQById } from '@/lib/api/contractor'
import { getSession } from '@/lib/auth/session'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { SubmittedBidStatus } from '@/lib/types/vendor'

interface Props {
  params: Promise<{ bidId: string }>
}

const STATUS_STYLES: Record<SubmittedBidStatus, React.CSSProperties> = {
  pending: { background: '#ede8e2', color: '#4a6358' },
  under_review: { background: '#fff3eb', color: '#fa6b04' },
  shortlisted: { background: '#e8f4ee', color: '#2d6a4f' },
  rejected: { background: '#fdeaea', color: '#c0392b' },
}

const STATUS_LABELS: Record<SubmittedBidStatus, string> = {
  pending: 'Pending',
  under_review: 'Under Review',
  shortlisted: 'Shortlisted',
  rejected: 'Rejected',
}

const AVAILABILITY_STYLES: Record<string, React.CSSProperties> = {
  in_stock: { background: '#e8f4ee', color: '#2d6a4f' },
  can_source: { background: '#fdf0e8', color: '#a85c2a' },
  unavailable: { background: '#fdeaea', color: '#c0392b' },
}

const AVAILABILITY_LABELS: Record<string, string> = {
  in_stock: 'In Stock',
  can_source: 'Can Source',
  unavailable: 'Unavailable',
}

export default async function BidDetailPage({ params }: Props) {
  const { bidId } = await params
  const session = await getSession()
  const bid = await getSubmittedBid(bidId, session?.userId)
  if (!bid) notFound()

  // Try to load RFQ for additional context
  const rfq = await getContractorRFQById(bid.rfq_id)

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-sm" style={{ color: '#4a6358' }}>
          <Link href="/vendor/bids" className="hover:text-[#1e3a2f] transition-colors" style={{ color: '#4a6358' }}>My Quotes</Link>
          <span>›</span>
          <span className="font-medium truncate max-w-[300px]" style={{ color: '#1e3a2f' }}>{bid.rfq_title}</span>
        </div>

        {/* Bid header card */}
        <div
          className="mb-5 rounded-xl p-5 shadow-sm"
          style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1
                className="text-lg font-semibold"
                style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}
              >
                {bid.rfq_title}
              </h1>
              <p className="mt-0.5 text-sm" style={{ color: '#4a6358' }}>{bid.project_name} · {bid.contractor_name}</p>
            </div>
            <span className="rounded-full px-3 py-1 text-sm font-medium" style={STATUS_STYLES[bid.status]}>
              {STATUS_LABELS[bid.status]}
            </span>
          </div>

          <div
            className="mt-4 grid grid-cols-2 gap-4 pt-4 sm:grid-cols-4"
            style={{ borderTop: '1px solid #ede8e2' }}
          >
            <div>
              <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>Total Quote Value</p>
              <p className="mt-0.5 text-lg font-bold" style={{ color: '#1e3a2f' }}>{formatCurrency(bid.total_price)}</p>
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>Submitted</p>
              <p className="mt-0.5 text-sm" style={{ color: '#4a6358' }}>{formatDate(bid.submitted_at)}</p>
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>Line Items</p>
              <p className="mt-0.5 text-sm" style={{ color: '#4a6358' }}>{bid.line_item_count} SKU{bid.line_item_count !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        {/* Line item responses */}
        <div
          className="rounded-xl shadow-sm"
          style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
        >
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #ede8e2' }}>
            <h2 className="text-sm font-semibold" style={{ color: '#4a6358' }}>Submitted Line Item Responses</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead style={{ borderBottom: '1px solid #ede8e2', background: '#ede8e2' }}>
                <tr>
                  <th className="px-4 py-2.5 font-semibold" style={{ color: '#4a6358' }}>Item</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap" style={{ color: '#4a6358' }}>Availability</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap" style={{ color: '#4a6358' }}>Units Avail.</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap" style={{ color: '#4a6358' }}>Unit Price</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap" style={{ color: '#4a6358' }}>Total</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap" style={{ color: '#4a6358' }}>Lead Time</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap" style={{ color: '#4a6358' }}>Delivery Terms</th>
                  <th className="px-4 py-2.5 font-semibold" style={{ color: '#4a6358' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {bid.line_item_responses.map((r, idx) => {
                  // Try to enrich from contractor RFQ line items
                  const rfqItem = rfq?.line_items.find((li) => li.id === r.line_item_id)
                  const avail = r.availability ?? 'can_source'
                  return (
                    <tr
                      key={r.line_item_id}
                      style={{
                        borderBottom: '1px solid #ede8e2',
                        background: idx % 2 === 1 ? '#f5f0eb' : '#ffffff',
                      }}
                    >
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="font-medium truncate" style={{ color: '#1e3a2f' }}>
                          {rfqItem?.description ?? r.line_item_id}
                        </p>
                        {rfqItem?.sku && (
                          <p style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: '#8a9e96' }}>{rfqItem.sku}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className="rounded px-1.5 py-0.5 font-medium"
                          style={AVAILABILITY_STYLES[avail] ?? {}}
                        >
                          {AVAILABILITY_LABELS[avail] ?? avail}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: '#4a6358' }}>
                        {r.units_available != null ? r.units_available.toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: '#4a6358' }}>
                        {formatCurrency(r.unit_price)}
                      </td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: '#1e3a2f' }}>
                        {formatCurrency(r.total_price)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: '#4a6358' }}>
                        {r.lead_time_days ? `${r.lead_time_days} days` : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: '#4a6358' }}>
                        {r.delivery_terms || '-'}
                      </td>
                      <td className="px-4 py-3 max-w-[180px]" style={{ color: '#4a6358' }}>
                        <p className="truncate">{r.notes || '-'}</p>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot style={{ borderTop: '1px solid #e2d9cf', background: '#ede8e2' }}>
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-right" style={{ color: '#4a6358' }}>
                    Total Quote Value
                  </td>
                  <td className="px-4 py-2.5 text-sm font-bold whitespace-nowrap" style={{ color: '#1e3a2f' }}>
                    {formatCurrency(bid.total_price)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
