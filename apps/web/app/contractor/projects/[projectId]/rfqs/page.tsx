import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getContractorProject, getContractorProjectRFQs } from '@/lib/api/contractor'
import { canAccessContractorProject } from '@/lib/auth/project-access'
import { getSession } from '@/lib/auth/session'
import { RFQListTable } from './_components/RFQListTable'
import { ExternalQuoteImportButton } from '../_components/ExternalQuoteImportButton'

export const metadata = { title: 'RFQs - Rialto' }

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Drafts', value: 'pending' },
  { label: 'Active', value: 'active' },
  { label: 'Closed', value: 'closed' },
]

export default async function RFQListPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { projectId } = await params
  const { status } = await searchParams

  const [session, project, rfqs] = await Promise.all([
    getSession(),
    getContractorProject(projectId),
    getContractorProjectRFQs(projectId, status),
  ])

  if (!project || !canAccessContractorProject(session, project)) notFound()

  return (
    <div className="mx-auto max-w-4xl">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm" style={{ color: '#8a9e96' }}>
        <Link href="/contractor/projects" className="hover:underline" style={{ color: '#8a9e96' }}>Projects</Link>
        <span className="mx-2">/</span>
        <Link href={`/contractor/projects/${projectId}`} className="hover:underline" style={{ color: '#8a9e96' }}>
          {project.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="font-medium" style={{ color: '#4a6358' }}>RFQs</span>
      </nav>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>RFQs</h1>
        <div className="flex items-center gap-2">
          <ExternalQuoteImportButton projectId={projectId} variant="empty" />
          <Link
            href={`/contractor/projects/${projectId}/rfqs/new`}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors"
            style={{ background: '#1e3a2f' }}
          >
            + Create RFQ
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-1 rounded-lg border p-1 w-fit" style={{ borderColor: '#e2d9cf', background: '#ede8e2' }}>
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/contractor/projects/${projectId}/rfqs${tab.value ? `?status=${tab.value}` : ''}`}
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={(status ?? '') === tab.value
              ? { background: '#ffffff', color: '#1e3a2f', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
              : { color: '#8a9e96' }}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <RFQListTable rfqs={rfqs} projectId={projectId} />
    </div>
  )
}
