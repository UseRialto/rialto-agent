import { AppShell } from '@/components/layout/AppShell'
import { getSession } from '@/lib/auth/session'
import { getVendorProjectsSummary } from '@/lib/api/vendor'
import { ProjectCard } from './_components/ProjectCard'

export const metadata = {
  title: 'Active Projects - Rialto Vendor',
}

export default async function VendorProjectsPage() {
  const session = await getSession()
  const vendorEmail = session?.email ?? ''
  const vendorId = session?.userId ?? ''

  const { projects, totalOpenRFQs, invitedProjectCount } = await getVendorProjectsSummary(vendorEmail, vendorId)

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>Active Projects</h1>
          <p className="mt-0.5 text-sm" style={{ color: '#8a9e96' }}>
            Construction projects with open RFQs matching your materials.
          </p>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-4">
          <div className="rounded-2xl p-4" style={{ background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>Active Projects</p>
            <p className="mt-1 text-2xl font-bold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>{projects.length}</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>Open RFQs</p>
            <p className="mt-1 text-2xl font-bold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>{totalOpenRFQs}</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#fdf0e8', border: '1px solid #e8c4a0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <p className="text-xs font-medium" style={{ color: '#a85c2a' }}>Invited To</p>
            <p className="mt-1 text-2xl font-bold" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#a85c2a' }}>
              {invitedProjectCount} project{invitedProjectCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-12 text-center" style={{ borderColor: '#e2d9cf', background: 'rgba(255,255,255,0.8)' }}>
            <p className="text-sm font-medium" style={{ color: '#4a6358' }}>No active projects at the moment.</p>
            <p className="mt-1 text-xs" style={{ color: '#8a9e96' }}>
              Projects will appear here as contractors publish RFQs.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                href={`/vendor/projects/${project.id}`}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
