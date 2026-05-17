import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getContractorProject } from '@/lib/api/contractor'
import { canAccessContractorProject } from '@/lib/auth/project-access'
import { getSession } from '@/lib/auth/session'
import { VendorQuoteImportWorkflow } from './_components/VendorQuoteImportWorkflow'

export const metadata = { title: 'Import Vendor Quotes - Rialto' }

export default async function ImportVendorQuotesPage({
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
    <div className="mx-auto w-full max-w-[88rem] px-8 pb-10 sm:px-10 lg:px-14">
      <div className="mb-7">
        <nav className="mb-3 flex items-center gap-1.5 text-xs" style={{ color: '#8a9e96' }}>
          <Link href="/contractor/projects" className="hover:underline" style={{ color: '#4a6358' }}>Projects</Link>
          <span>/</span>
          <Link href={`/contractor/projects/${projectId}`} className="hover:underline" style={{ color: '#4a6358' }}>{project.name}</Link>
          <span>/</span>
          <span className="font-semibold" style={{ color: '#1e3a2f' }}>Import Vendor Quotes</span>
        </nav>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>
          Import Vendor Quotes
        </h1>
        <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>
          Create an RFQ from returned vendor quote files and open the normalized comparison sheet.
        </p>
      </div>

      <VendorQuoteImportWorkflow projectId={projectId} projectName={project.name} />
    </div>
  )
}
