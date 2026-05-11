import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { getSession } from '@/lib/auth/session'
import { getContractorProject } from '@/lib/api/contractor'
import { getRFQsForProject } from '@/lib/api/vendor'
import { RFQListTable } from './_components/RFQListTable'
import { findUserById } from '@/lib/auth/users'

interface Props {
  params: Promise<{ projectId: string }>
}

export default async function ProjectPage({ params }: Props) {
  const { projectId } = await params

  const [session, contractorProject] = await Promise.all([
    getSession(),
    getContractorProject(projectId),
  ])

  if (!contractorProject) notFound()

  const vendorEmail = session?.email ?? ''
  const vendorId = session?.userId ?? ''

  const owner = await findUserById(contractorProject.owner_id)
  const contractorName = owner?.company_info?.company_name ?? owner?.name ?? 'General Contractor'

  const rfqRows = await getRFQsForProject(projectId, vendorEmail, vendorId)
  const draftCount = rfqRows.filter((r) => r.vendor_response_status === 'draft').length
  const hasAnonymousRFQs = rfqRows.some((rfq) => rfq.anonymous_public_listing)

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center gap-2 text-sm" style={{ color: '#4a6358' }}>
          <Link href="/vendor/projects" style={{ color: '#4a6358' }}>Projects</Link>
          <span>›</span>
          <span className="font-medium" style={{ color: '#1e3a2f' }}>{contractorProject.name}</span>
        </div>

        <div
          className="mb-5 rounded-xl p-5 shadow-sm"
          style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1
                className="text-xl font-semibold"
                style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}
              >
                {contractorProject.name}
              </h1>
              <p className="mt-0.5 text-sm" style={{ color: '#4a6358' }}>
                {(hasAnonymousRFQs ? 'Confidential Buyer' : contractorName)} · {contractorProject.location}
              </p>
              {hasAnonymousRFQs && (
                <p className="mt-1 text-xs" style={{ color: '#a85c2a' }}>
                  Some public requests in this project are anonymized for marketplace quoting.
                </p>
              )}
              {contractorProject.description && (
                <p className="mt-1 text-sm" style={{ color: '#8a9e96' }}>{contractorProject.description}</p>
              )}
            </div>
            {rfqRows.find((r) => r.delivery_date) && (
              <span
                className="rounded px-2.5 py-1 text-xs font-semibold"
                style={{ background: '#fdf0e8', color: '#a85c2a' }}
              >
                Quote deadline: {rfqRows.sort((a, b) => (a.delivery_date ?? '').localeCompare(b.delivery_date ?? ''))[0]?.delivery_date}
              </span>
            )}
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: '#4a6358' }}>
            Open RFQs ({rfqRows.length})
          </h2>
        </div>

        {rfqRows.length === 0 ? (
          <div
            className="rounded-xl p-10 text-center"
            style={{ background: '#ffffff', border: '1px dashed #e2d9cf' }}
          >
            <p className="text-sm" style={{ color: '#4a6358' }}>No active RFQs for this project.</p>
          </div>
        ) : (
          <RFQListTable
            rfqs={rfqRows}
            projectId={projectId}
            draftCount={draftCount}
            disableBulkSelect
          />
        )}
      </div>
    </AppShell>
  )
}
