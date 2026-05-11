import Link from 'next/link'
import { CONTRACTOR_ORDER_STAGE_LABELS, CONTRACTOR_ORDER_STAGE_STYLES, toContractorDisplayOrderStage } from '@/lib/contractor-display'
import type { ContractorOrder } from '@/lib/types/contractor'

interface Props {
  orders: ContractorOrder[]
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${n.toLocaleString()}`
}

export function ContractorOrderTable({ orders }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <table className="w-full text-sm">
        <thead className="text-[10px] font-semibold uppercase tracking-wider" style={{ background: '#ede8e2', color: '#8a9e96' }}>
          <tr>
            <th className="px-4 py-2.5 text-left">RFQ / Order</th>
            <th className="px-4 py-2.5 text-left">Vendor</th>
            <th className="px-4 py-2.5 text-left">PO Number</th>
            <th className="px-4 py-2.5 text-center">Status</th>
            <th className="px-4 py-2.5 text-right">Value</th>
            <th className="px-4 py-2.5 text-left">Delivery</th>
            <th className="px-4 py-2.5 text-left">Next Follow-Up</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody style={{ borderTop: '1px solid #e2d9cf' }}>
          {orders.map((order) => {
            const displayStage = toContractorDisplayOrderStage(order.current_stage)
            return (
              <tr key={order.id} className="transition-colors hover:bg-[#ede8e2]" style={{ borderBottom: '1px solid #e2d9cf' }}>
                <td className="px-4 py-3 font-medium" style={{ color: '#1e3a2f' }}>{order.rfq_title}</td>
                <td className="px-4 py-3" style={{ color: '#4a6358' }}>{order.vendor_name}</td>
                <td className="px-4 py-3 text-xs" style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: '#8a9e96' }}>{order.po_number}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`rounded border px-2 py-0.5 text-xs font-medium ${CONTRACTOR_ORDER_STAGE_STYLES[displayStage]}`}>
                    {CONTRACTOR_ORDER_STAGE_LABELS[displayStage]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: '#1e3a2f' }}>
                  {fmt(order.agreed_price)}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: '#8a9e96' }}>{order.delivery_date}</td>
                <td className="px-4 py-3 text-xs" style={{ color: '#8a9e96' }}>
                  {order.next_follow_up_date || '-'}
                  {order.follow_up_status === 'needs_follow_up' && (
                    <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: '#fdf0e8', color: '#a85c2a' }}>
                      Follow up
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/contractor/orders/${order.id}`}
                    className="text-xs font-medium hover:underline"
                    style={{ color: '#4a6358' }}
                  >
                    View →
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
