import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { VendorOrder, OrderStage } from '@/lib/types/vendor'

interface Props {
  order: VendorOrder
}

const STAGE_LABELS: Record<OrderStage, string> = {
  confirmed: 'Confirmed',
  packaged: 'Packaged',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
}

const STAGE_STYLES: Record<OrderStage, React.CSSProperties> = {
  confirmed: { background: '#fff3eb', color: '#fa6b04' },
  packaged: { background: '#fdf0e8', color: '#a85c2a' },
  shipped: { background: '#ede8e2', color: '#4a6358' },
  out_for_delivery: { background: '#ede8e2', color: '#1e3a2f' },
  delivered: { background: '#e8f4ee', color: '#2d6a4f' },
}

export function OrderCard({ order }: Props) {
  return (
    <Link
      href={`/vendor/orders/${order.id}`}
      className="block rounded-xl border border-[#e2d9cf] p-4 shadow-sm transition-all hover:border-[#fa6b04] hover:shadow-md"
      style={{ background: '#ffffff' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: '#1e3a2f' }}>{order.rfq_title}</p>
          <p className="mt-0.5 text-xs truncate" style={{ color: '#4a6358' }}>{order.project_name} · {order.contractor_name}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
          style={STAGE_STYLES[order.current_stage]}
        >
          {STAGE_LABELS[order.current_stage]}
        </span>
      </div>

      <div
        className="mt-3 flex items-center justify-between gap-4 pt-3"
        style={{ borderTop: '1px solid #ede8e2' }}
      >
        <div className="flex items-center gap-4 text-xs" style={{ color: '#4a6358' }}>
          <span>
            <span className="font-medium" style={{ color: '#4a6358' }}>PO: </span>
            <span style={{ fontFamily: 'var(--font-dm-mono, monospace)' }}>{order.po_number}</span>
          </span>
          <span>
            <span className="font-medium" style={{ color: '#4a6358' }}>Delivery: </span>
            {formatDate(order.delivery_date)}
          </span>
        </div>
        <p className="text-sm font-bold" style={{ color: '#1e3a2f' }}>{formatCurrency(order.agreed_price)}</p>
      </div>
    </Link>
  )
}
