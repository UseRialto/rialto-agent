import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FilePlus2, MapPin, Settings, SlidersHorizontal } from 'lucide-react'
import { getContractorProject, getContractorProjectRFQCounts, getContractorProjectRFQs } from '@/lib/api/contractor'
import { canAccessContractorProject } from '@/lib/auth/project-access'
import { getSession } from '@/lib/auth/session'
import { RFQCounterCards } from './_components/RFQCounterCards'
import { ProjectSpecIndexKickoff } from './_components/ProjectSpecIndexKickoff'
import { ExternalQuoteImportButton } from './_components/ExternalQuoteImportButton'
import { RFQListTable } from './rfqs/_components/RFQListTable'
import { formatDate } from '@/lib/utils'

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const [session, project] = await Promise.all([
    getSession(),
    getContractorProject(projectId),
  ])
  if (!canAccessContractorProject(session, project)) return { title: 'Project - Rialto' }
  return { title: project ? `${project.name} - Rialto` : 'Project - Rialto' }
}

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Drafts', value: 'pending' },
  { label: 'Active', value: 'active' },
  { label: 'Closed', value: 'closed' },
]

export default async function ProjectDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { projectId } = await params
  const { status } = await searchParams
  const activeTab = status ?? ''

  const [session, project, counts, rfqs] = await Promise.all([
    getSession(),
    getContractorProject(projectId),
    getContractorProjectRFQCounts(projectId),
    getContractorProjectRFQs(projectId, status),
  ])

  if (!project || !canAccessContractorProject(session, project)) notFound()

  return (
    <div className="mx-auto max-w-7xl">
      <ProjectSpecIndexKickoff projectId={projectId} documents={project.spec_documents ?? []} />
      <nav className="mb-4 text-sm font-medium" style={{ color: '#8a9e96' }}>
        <Link href="/contractor/projects" className="inline-flex items-center gap-1.5 hover:underline" style={{ color: '#4a6358' }}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Projects
        </Link>
      </nav>

      <section className="mb-6 overflow-hidden rounded-2xl" style={{ background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="p-6 text-white lg:p-7" style={{ background: '#1e3a2f', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'rgba(200,115,90,0.15)', color: '#fdc89a', outline: '1px solid rgba(200,115,90,0.3)' }}>
                {project.status}
              </span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight" style={{ fontFamily: 'var(--font-lora, Georgia, serif)' }}>{project.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" style={{ color: '#fa6b04' }} />
                  {project.location}
                </span>
            {project.budget && (
                  <span>${project.budget.toLocaleString()} budget</span>
            )}
                <span>Created {formatDate(project.created_at)}</span>
              </div>
          {project.description && (
                <p className="mt-3 max-w-3xl text-sm leading-6" style={{ color: 'rgba(255,255,255,0.6)' }}>{project.description}</p>
          )}
        </div>
            <div className="flex flex-wrap items-center gap-2">
          <ExternalQuoteImportButton projectId={projectId} />
          <Link
            href={`/contractor/projects/${projectId}/settings`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white transition-colors"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
          >
                  <Settings className="h-4 w-4" />
            Settings
          </Link>
          <Link
            href={`/contractor/projects/${projectId}/rfqs/new`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
                  style={{ background: '#fa6b04', color: '#ffffff' }}
          >
                  <FilePlus2 className="h-4 w-4" />
                  Create RFQ
          </Link>
            </div>
          </div>
        </div>
        <div className="p-5 lg:p-6">
          <RFQCounterCards counts={counts} />
        </div>
      </section>

      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex w-fit gap-1 rounded-xl p-1" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
          {STATUS_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={`/contractor/projects/${projectId}${tab.value ? `?status=${tab.value}` : ''}`}
                className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                style={activeTab === tab.value
                  ? { background: '#1e3a2f', color: '#ffffff' }
                  : { color: '#8a9e96' }}
            >
              {tab.label}
            </Link>
          ))}
          </div>
          <div className="hidden items-center gap-2 text-xs font-medium md:flex" style={{ color: '#8a9e96' }}>
            <SlidersHorizontal className="h-4 w-4" />
            Filter by lifecycle state
          </div>
        </div>

        {counts.total === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-10 text-center" style={{ borderColor: '#e2d9cf', background: 'rgba(255,255,255,0.8)' }}>
            <p className="text-sm font-semibold" style={{ color: '#4a6358' }}>No procurement requests yet for this project.</p>
            <p className="mt-1 text-xs" style={{ color: '#8a9e96' }}>Create an RFQ to request exact pricing from vendors.</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <ExternalQuoteImportButton projectId={projectId} variant="empty" />
              <Link
                href={`/contractor/projects/${projectId}/rfqs/new`}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors"
                style={{ background: '#1e3a2f' }}
              >
                <FilePlus2 className="h-4 w-4" />
                Create First RFQ
              </Link>
            </div>
          </div>
        ) : (
          <RFQListTable rfqs={rfqs} projectId={projectId} />
        )}
      </div>
    </div>
  )
}
