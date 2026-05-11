import { AppShell } from '@/components/layout/AppShell'
import { getSession } from '@/lib/auth/session'
import { getVendorOrders } from '@/lib/api/orders'
import { OrderCard } from './_components/OrderCard'

export const metadata = {
  title: 'My Orders - Rialto Vendor',
}

export default async function VendorOrdersPage() {
  const session = await getSession()
  const orders = await getVendorOrders(session?.userId)

  const active = orders.filter((o) => o.current_stage !== 'delivered')
  const completed = orders.filter((o) => o.current_stage === 'delivered')

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1
            className="text-xl font-semibold"
            style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}
          >
            My Orders
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: '#4a6358' }}>
            Track and fulfill your awarded purchase orders.
          </p>
        </div>

        {orders.length === 0 ? (
          <div
            className="rounded-xl p-10 text-center"
            style={{ background: '#ffffff', border: '1px dashed #e2d9cf' }}
          >
            <p className="text-sm font-medium" style={{ color: '#4a6358' }}>No orders yet.</p>
            <p className="mt-1 text-xs" style={{ color: '#8a9e96' }}>
              Orders appear here once a contractor awards your quote.
            </p>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <div className="mb-8">
                <h2
                  className="mb-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: '#8a9e96' }}
                >
                  Active Orders ({active.length})
                </h2>
                <div className="space-y-3">
                  {active.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </div>
              </div>
            )}

            {completed.length > 0 && (
              <div>
                <h2
                  className="mb-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: '#8a9e96' }}
                >
                  Completed ({completed.length})
                </h2>
                <div className="space-y-3">
                  {completed.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
