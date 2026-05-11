import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getContractorActivity, getContractorProjectRFQCountsByProjectIds, getContractorProjects } from '@/lib/api/contractor'
import { ProjectCard } from './_components/ProjectCard'
import { ActivityFeed } from './_components/ActivityFeed'

export const metadata = {
  title: 'My Projects - Rialto',
}

export default async function ContractorProjectsPage() {
  const session = await getSession()
  const userId = session?.userId ?? ''
  const [projects, notifications] = await Promise.all([
    getContractorProjects(userId),
    getContractorActivity(userId),
  ])
  const rfqCountsByProjectId = await getContractorProjectRFQCountsByProjectIds(projects.map((project) => project.id))

  return (
    <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
      <div className="space-y-8">
        <section
          className="overflow-hidden rounded-2xl border"
          style={{ background: '#1e3a2f', borderColor: '#1e3a2f', boxShadow: '0 24px 60px rgba(30,58,47,0.16)' }}
        >
          <div className="p-6 sm:p-8">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#ffffff' }}>
                Projects
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: '#d8e3dc' }}>
                Manage RFQs, vendor activity, and awarded procurement from one place.
              </p>
            </div>
            <Link
              href="/contractor/projects/new"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5"
              style={{ background: '#fa6b04', boxShadow: '0 10px 22px rgba(0,0,0,0.16)' }}
            >
              <Plus className="h-4 w-4" />
              New Project
            </Link>
          </div>
          </div>
        </section>

        {projects.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-12 text-center" style={{ borderColor: '#e2d9cf', background: 'rgba(255,255,255,0.8)' }}>
            <p className="text-base font-semibold" style={{ color: '#1e3a2f' }}>No projects yet.</p>
            <p className="mt-1 text-sm" style={{ color: '#8a9e96' }}>Create your first project to start issuing RFQs.</p>
            <Link
              href="/contractor/projects/new"
              className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors"
              style={{ background: '#1e3a2f' }}
            >
              <Plus className="h-4 w-4" />
              Create Project
            </Link>
          </div>
        ) : (
          <section>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                counts={rfqCountsByProjectId.get(project.id) ?? { total: 0, pending: 0, active: 0, awarded: 0 }}
              />
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <ActivityFeed notifications={notifications} variant="dark" />
      </aside>
    </div>
  )
}
