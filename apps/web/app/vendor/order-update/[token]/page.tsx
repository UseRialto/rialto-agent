import { findReminderByToken, markReminderOpened } from '@/lib/order-reminders'
import { getContractorOrder } from '@/lib/store/contractor-store'
import Image from 'next/image'
import { OrderUpdateForm } from './_components/OrderUpdateForm'

function StatusCard({ title, body }: { title: string; body: string }) {
  return (
    <main
      className="min-h-screen px-4 py-10"
      style={{ background: 'radial-gradient(circle at top left, #fff3eb 0, transparent 30rem), linear-gradient(180deg, #f5f0eb 0%, #ede8e2 100%)' }}
    >
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl items-center">
        <div className="w-full rounded-2xl border bg-white p-8 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
          <Image src="/Rialto_Full_Logo_CLEAR.png" alt="Rialto" height={38} width={126} className="object-contain" />
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#8a9e96' }}>Order Update</p>
          <h1 className="mt-3 text-2xl font-semibold" style={{ color: '#1e3a2f' }}>{title}</h1>
          <p className="mt-2 text-sm" style={{ color: '#4a6358' }}>{body}</p>
        </div>
      </div>
    </main>
  )
}

export default async function OrderUpdatePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const reminder = await findReminderByToken(token)
  if (!reminder) {
    return <StatusCard title="Invalid or expired link" body="This order update link could not be verified or has expired." />
  }

  const order = await getContractorOrder(reminder.order_id)
  if (!order) {
    return <StatusCard title="Order not found" body="The order associated with this link could not be found." />
  }
  if (order.current_stage === 'delivered') {
    return <StatusCard title="Order complete" body="This order has already been marked as delivered. No further updates are needed." />
  }

  // Record first open
  await markReminderOpened(reminder.id)

  return (
    <main
      className="min-h-screen"
      style={{ background: 'radial-gradient(circle at top left, #fff3eb 0, transparent 30rem), linear-gradient(180deg, #f5f0eb 0%, #ede8e2 100%)' }}
    >
      <div className="mx-auto max-w-2xl px-4 py-10">
        <header className="mb-6 rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
          <Image src="/Rialto_Full_Logo_CLEAR.png" alt="Rialto" height={36} width={120} className="object-contain" />
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#fa6b04' }}>Order Status Update</p>
          <h1 className="mt-2 text-2xl font-semibold" style={{ color: '#1e3a2f' }}>{order.rfq_title}</h1>
          <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>
            PO {order.po_number} · {order.vendor_name}
          </p>
          {order.expected_delivery_date && (
            <p className="mt-1 text-sm" style={{ color: '#8a9e96' }}>
              Expected delivery:{' '}
              <span className="font-medium" style={{ color: '#1e3a2f' }}>
                {new Date(order.expected_delivery_date).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </p>
          )}
        </header>

        <OrderUpdateForm
          token={token}
          orderId={order.id}
          currentStage={order.current_stage}
          reminderId={reminder.id}
          lineItems={order.line_items_snapshot}
        />
      </div>
    </main>
  )
}
