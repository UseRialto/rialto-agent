import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, MapPin, PackageCheck, ReceiptText, Truck } from 'lucide-react'
import { getContractorOrderDetail } from '@/lib/api/contractor'
import { CONTRACTOR_ORDER_STAGE_LABELS, CONTRACTOR_ORDER_STAGE_STYLES, toContractorDisplayOrderStage } from '@/lib/contractor-display'
import { ContractorOrderProgressStepper } from '../_components/ContractorOrderProgressStepper'
import { OrderFollowUpCard } from './_components/OrderFollowUpCard'

export const metadata = { title: 'Order Detail - Rialto' }

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${n.toLocaleString()}`
}

export default async function ContractorOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = await params
  const order = await getContractorOrderDetail(orderId)
  if (!order) notFound()
  const displayStage = toContractorDisplayOrderStage(order.current_stage)

  const shippedStage = order.stage_history.find((s) => s.stage === 'shipped')
  const summaryCards = [
    { Icon: PackageCheck, label: 'Vendor', value: order.vendor_name },
    { Icon: ReceiptText, label: 'Project', value: order.project_name },
    { Icon: CalendarDays, label: 'Delivery Date', value: order.delivery_date || 'TBD' },
    { Icon: MapPin, label: 'Delivery Location', value: order.delivery_location || 'Not set' },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm" style={{ color: '#8a9e96' }}>
        <Link href="/contractor/orders" className="hover:underline" style={{ color: '#8a9e96' }}>Track Orders</Link>
        <span className="mx-2">/</span>
        <span className="font-medium" style={{ color: '#4a6358' }}>{order.rfq_title}</span>
      </nav>

      <div className="mb-6 overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <div className="border-b px-6 py-5" style={{ borderColor: '#e2d9cf', background: '#fff3eb' }}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${CONTRACTOR_ORDER_STAGE_STYLES[displayStage]}`}>
                  {CONTRACTOR_ORDER_STAGE_LABELS[displayStage]}
                </span>
                <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: '#ede8e2', color: '#4a6358' }}>
                  PO {order.po_number}
                </span>
              </div>
              <h1 className="mt-3 max-w-4xl text-2xl font-semibold" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>{order.rfq_title}</h1>
              <p className="mt-2 text-sm" style={{ color: '#8a9e96' }}>
                {order.vendor_name} · {order.project_name} · Awarded {new Date(order.awarded_at).toLocaleDateString()}
              </p>
            </div>
            <div className="rounded-xl border bg-white px-5 py-4 text-right shadow-sm" style={{ borderColor: '#e2d9cf' }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Agreed Value</p>
              <p className="mt-1 text-2xl font-semibold" style={{ color: '#1e3a2f' }}>{fmt(order.agreed_price)}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map(({ Icon, label, value }) => (
            <div key={label} className="rounded-xl border p-4" style={{ borderColor: '#e2d9cf', background: '#ede8e2' }}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" aria-hidden="true" style={{ color: '#8a9e96' }} />
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>{label}</p>
              </div>
              <p className="mt-2 truncate text-sm font-semibold" style={{ color: '#1e3a2f' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_0.9fr]">
        <div className="space-y-5">
          <ContractorOrderProgressStepper currentStage={order.current_stage} stageHistory={order.stage_history} />

          {shippedStage && (
            <div className="rounded-xl border px-5 py-4" style={{ borderColor: '#e2d9cf', background: '#ede8e2' }}>
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4" aria-hidden="true" style={{ color: '#4a6358' }} />
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Shipping Info</p>
              </div>
              <div className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs" style={{ color: '#8a9e96' }}>Carrier</p>
                  <p className="font-medium" style={{ color: '#1e3a2f' }}>{shippedStage.carrier ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: '#8a9e96' }}>Tracking #</p>
                  <p className="font-medium" style={{ color: '#1e3a2f', fontFamily: 'var(--font-dm-mono, monospace)' }}>{shippedStage.tracking_number ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: '#8a9e96' }}>Ship Date</p>
                  <p className="font-medium" style={{ color: '#1e3a2f' }}>{shippedStage.ship_date ?? '-'}</p>
                </div>
              </div>
            </div>
          )}

          {order.line_items_snapshot.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold" style={{ color: '#4a6358' }}>
                Line Items ({order.line_items_snapshot.length})
              </h2>
              <div className="overflow-hidden rounded-xl border bg-white shadow-sm" style={{ borderColor: '#e2d9cf' }}>
                <table className="w-full text-sm">
                  <thead className="text-xs font-semibold uppercase tracking-wider" style={{ background: '#ede8e2', color: '#8a9e96' }}>
                    <tr>
                      <th className="px-4 py-3 text-left">SKU</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-left">Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: '#e2d9cf' }}>
                    {order.line_items_snapshot.map((item) => (
                      <tr
                        key={item.id}
                        className="transition-colors hover:bg-[#ede8e2]"
                      >
                        <td className="px-4 py-3 text-xs" style={{ color: '#4a6358', fontFamily: 'var(--font-dm-mono, monospace)' }}>{item.sku || '-'}</td>
                        <td className="px-4 py-3" style={{ color: '#4a6358' }}>{item.description}</td>
                        <td className="px-4 py-3 text-right font-semibold" style={{ color: '#1e3a2f' }}>{item.quantity.toLocaleString()}</td>
                        <td className="px-4 py-3" style={{ color: '#8a9e96' }}>{item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8a9e96' }}>Delivery Location</p>
            <p className="mt-2 text-sm font-medium" style={{ color: '#1e3a2f' }}>{order.delivery_location}</p>
          </div>
          <OrderFollowUpCard
            orderId={order.id}
            orderedAt={order.ordered_at}
            expectedDeliveryDate={order.expected_delivery_date}
            nextFollowUpDate={order.next_follow_up_date}
            followUpStatus={order.follow_up_status}
            followUpNotes={order.follow_up_notes}
          />
        </div>
      </div>
    </div>
  )
}
