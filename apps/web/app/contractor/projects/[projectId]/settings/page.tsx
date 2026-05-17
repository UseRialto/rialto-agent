import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getContractorProject } from '@/lib/api/contractor'
import { canAccessContractorProject } from '@/lib/auth/project-access'
import { getSession } from '@/lib/auth/session'
import { ProjectSettingsClient } from './_components/ProjectSettingsClient'

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const [session, project] = await Promise.all([
    getSession(),
    getContractorProject(projectId),
  ])
  if (!canAccessContractorProject(session, project)) return { title: 'Settings - Rialto' }
  return { title: project ? `Settings - ${project.name} - Rialto` : 'Settings - Rialto' }
}

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const [session, project] = await Promise.all([
    getSession(),
    getContractorProject(projectId),
  ])
  if (!project || !canAccessContractorProject(session, project)) notFound()

  return (
    <div className="mx-auto max-w-2xl">
      <nav className="mb-4 text-sm" style={{ color: '#8a9e96' }}>
        <Link href="/contractor/projects" className="hover:underline" style={{ color: '#8a9e96' }}>Projects</Link>
        <span className="mx-2">/</span>
        <Link href={`/contractor/projects/${projectId}`} className="hover:underline" style={{ color: '#8a9e96' }}>{project.name}</Link>
        <span className="mx-2">/</span>
        <span className="font-medium" style={{ color: '#4a6358' }}>Settings</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>Project Settings</h1>
        <p className="mt-0.5 text-sm" style={{ color: '#8a9e96' }}>Edit project details or delete this project.</p>
      </div>

      <ProjectSettingsClient project={project} />
    </div>
  )
}
