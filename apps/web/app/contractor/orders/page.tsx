import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { getContractorOrdersGrouped } from '@/lib/api/contractor'
import { ContractorOrderTable } from './_components/ContractorOrderTable'

export const metadata = { title: 'Track Orders - Rialto' }

export default async function ContractorOrdersPage() {
  const session = await getSession()
  const grouped = await getContractorOrdersGrouped(session?.userId ?? '')
  const groups = Object.values(grouped)

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>Track Orders</h1>
        <p className="mt-0.5 text-sm" style={{ color: '#8a9e96' }}>
          Monitor fulfillment status for awarded orders across all your projects.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed p-12 text-center" style={{ borderColor: '#e2d9cf', background: 'rgba(255,255,255,0.8)' }}>
          <p className="text-sm font-medium" style={{ color: '#4a6358' }}>No orders yet.</p>
          <p className="mt-1 text-xs" style={{ color: '#8a9e96' }}>
            Orders appear here as soon as you create purchase orders from quote comparison.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(({ project, orders }) => {
            const activeCount = orders.filter((o) => o.current_stage !== 'delivered').length
            return (
              <div key={project.id}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <Link
                      href={`/contractor/projects/${project.id}`}
                      className="text-base font-semibold hover:underline transition-colors"
                      style={{ color: '#1e3a2f' }}
                    >
                      {project.name}
                    </Link>
                    <p className="text-xs" style={{ color: '#8a9e96' }}>{project.location}</p>
                  </div>
                  {activeCount > 0 && (
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: '#e8f4ee', color: '#2d6a4f' }}>
                      {activeCount} active
                    </span>
                  )}
                </div>

                <ContractorOrderTable orders={orders} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
