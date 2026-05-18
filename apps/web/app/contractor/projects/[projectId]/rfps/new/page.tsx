import { notFound } from 'next/navigation'
import { getContractorProject, getContractorRFQById } from '@/lib/api/contractor'
import { canAccessContractorProject } from '@/lib/auth/project-access'
import { getSession } from '@/lib/auth/session'
import { findUserById } from '@/lib/auth/users'
import { contractorCustomizationFromUser } from '@/lib/contractor-customization'
import { buildRFQEmailDraft } from '@/lib/mail/rfq-email-draft'
import { RFQWizard } from '../../rfqs/new/_components/RFQWizard'

export const metadata = { title: 'Create RFP - Rialto' }

export default async function CreateRFPPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ rfqId?: string; step?: string }>
}) {
  const { projectId } = await params
  const { rfqId, step } = await searchParams
  const [session, project] = await Promise.all([
    getSession(),
    getContractorProject(projectId),
  ])
  if (!project || !canAccessContractorProject(session, project)) notFound()
  const existingRFQ = rfqId ? await getContractorRFQById(rfqId) : null
  if (existingRFQ && (existingRFQ.project_id !== projectId || existingRFQ.request_type !== 'rfp')) notFound()

  const user = session ? await findUserById(session.userId) : null
  const contractorName = user?.company_info?.company_name ?? user?.name ?? session?.name ?? 'General Contractor'
  const contractorUserName = user?.name ?? session?.name ?? contractorName
  const contractorCustomization = contractorCustomizationFromUser(user)
  const initialTitle = existingRFQ?.title ?? `${project.name} - ${new Date().toLocaleString('en-US', { month: 'long' })} ${new Date().getFullYear()} Materials RFP`
  const initialDraft = buildRFQEmailDraft({
    contractorName,
    senderName: contractorUserName,
    projectName: project.name,
    rfqTitle: initialTitle,
    requestType: 'rfp',
  })
  const initialStep = step === 'invite-vendors' ? 1 : step === 'review' ? 2 : 0

  return (
    <div className="mx-auto w-full max-w-[88rem] px-8 pb-10 sm:px-10 lg:px-14">
      <div className="mb-7">
        <nav className="mb-3 flex items-center gap-1.5 text-xs" style={{ color: '#8a9e96' }}>
          <a href={`/contractor/projects`} className="hover:underline" style={{ color: '#4a6358' }}>Projects</a>
          <span>/</span>
          <a href={`/contractor/projects/${projectId}`} className="hover:underline" style={{ color: '#4a6358' }}>{project.name}</a>
          <span>/</span>
          <span className="font-semibold" style={{ color: '#1e3a2f' }}>{existingRFQ ? 'Edit RFP Draft' : 'New RFP'}</span>
        </nav>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>
          {existingRFQ ? 'Edit RFP Draft' : 'Create an RFP'}
        </h1>
        <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>
          {existingRFQ
            ? 'Update your draft RFP, revise vendors, and publish when the package is ready.'
            : 'Build a materials RFP, invite vendors, and publish to start receiving responses.'}
        </p>
      </div>

      <RFQWizard
        projectId={projectId}
        projectName={project.name}
        projectLocation={project.location}
        contractorName={contractorName}
        contractorUserName={contractorUserName}
        existingCategories={project.rfq_categories ?? []}
        initialEmailSubject={initialDraft.subject}
        initialEmailBody={initialDraft.body}
        initialRFQ={existingRFQ ?? undefined}
        contractorCustomization={contractorCustomization}
        forcedRequestType="rfp"
        requestTypeLocked
        initialStep={initialStep}
      />
    </div>
  )
}
