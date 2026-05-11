import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { getSession } from '@/lib/auth/session'
import { getVendorOrder } from '@/lib/api/orders'
import { formatCurrency } from '@/lib/utils'
import { OrderProgressStepper } from './_components/OrderProgressStepper'
import { StageActions } from './_components/StageActions'

interface Props {
  params: Promise<{ orderId: string }>
}

export default async function OrderDetailPage({ params }: Props) {
  const { orderId } = await params
  const session = await getSession()
  const order = await getVendorOrder(orderId, session?.userId)
  if (!order) notFound()

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-sm" style={{ color: '#4a6358' }}>
          <Link href="/vendor/orders" style={{ color: '#4a6358' }}>My Orders</Link>
          <span>›</span>
          <span className="font-medium truncate max-w-[300px]" style={{ color: '#1e3a2f' }}>{order.rfq_title}</span>
        </div>

        {/* Order header */}
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
                {order.rfq_title}
              </h1>
              <p className="mt-0.5 text-sm" style={{ color: '#4a6358' }}>{order.project_name} · {order.contractor_name}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>PO Number</p>
              <p
                className="text-sm font-semibold"
                style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: '#2d6a4f' }}
              >
                {order.po_number}
              </p>
            </div>
          </div>
          <div
            className="mt-4 grid grid-cols-3 gap-4 pt-4"
            style={{ borderTop: '1px solid #ede8e2' }}
          >
            <div>
              <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>Agreed Value</p>
              <p className="mt-0.5 text-lg font-bold" style={{ color: '#1e3a2f' }}>{formatCurrency(order.agreed_price)}</p>
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>Delivery Date</p>
              <p className="mt-0.5 text-sm" style={{ color: '#4a6358' }}>{order.delivery_date}</p>
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>Deliver To</p>
              <p className="mt-0.5 text-sm truncate" style={{ color: '#4a6358' }}>{order.delivery_location}</p>
            </div>
          </div>
        </div>

        {/* Progress stepper */}
        <div className="mb-5">
          <OrderProgressStepper currentStage={order.current_stage} stageHistory={order.stage_history} />
        </div>

        {/* Stage-specific actions */}
        <div className="mb-5">
          <h2 className="mb-3 text-sm font-semibold" style={{ color: '#4a6358' }}>
            {order.current_stage === 'delivered' ? 'Fulfillment Complete' : 'Next Step'}
          </h2>
          <StageActions order={order} />
        </div>
      </div>
    </AppShell>
  )
}
