import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { getSession } from '@/lib/auth/session'
import { getContractorRFQById, getContractorProject, getContractorRFQBids } from '@/lib/api/contractor'
import { getBidDraft } from '@/lib/api/vendor'
import { ContractorRFQBidClient } from './_components/ContractorRFQBidClient'

export async function generateMetadata({ params }: { params: Promise<{ rfqId: string }> }) {
  const { rfqId } = await params
  const contractorRFQ = await getContractorRFQById(rfqId)
  return { title: contractorRFQ ? `${contractorRFQ.title} - Rialto` : 'RFQ - Rialto' }
}

export default async function VendorRFQPage({
  params,
}: {
  params: Promise<{ rfqId: string }>
}) {
  const { rfqId } = await params

  const [contractorRFQ, session] = await Promise.all([
    getContractorRFQById(rfqId),
    getSession(),
  ])

  if (!contractorRFQ) notFound()
  if (contractorRFQ.status !== 'active') notFound()

  const [project, existingDraft, existingBidList] = await Promise.all([
    getContractorProject(contractorRFQ.project_id),
    getBidDraft(rfqId, session?.userId),
    getContractorRFQBids(contractorRFQ),
  ])

  const vendorEmail = session?.email ?? ''
  const vendorId = session?.userId ?? ''
  const isInvited =
    contractorRFQ.invited_vendor_emails.includes(vendorEmail) ||
    (vendorId ? contractorRFQ.invited_vendor_ids.includes(vendorId) : false)
  const existingBid = existingBidList.find((bid) => (
    (vendorId && bid.vendor_id === vendorId) || (vendorEmail && bid.vendor_email === vendorEmail)
  )) ?? null

  const backHref = `/vendor/projects/${contractorRFQ.project_id}`

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center gap-2 text-sm" style={{ color: '#4a6358' }}>
          <Link href="/vendor/projects" style={{ color: '#4a6358' }}>Projects</Link>
          <span>›</span>
          <Link href={backHref} style={{ color: '#4a6358' }}>
            {project?.name ?? 'Project'}
          </Link>
          <span>›</span>
          <span className="font-medium truncate max-w-[200px]" style={{ color: '#1e3a2f' }}>{contractorRFQ.title}</span>
        </div>
        <h1
          className="mb-5 text-xl font-semibold"
          style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}
        >
          Respond to RFQ
        </h1>
        <ContractorRFQBidClient
          rfq={contractorRFQ}
          isInvited={isInvited}
          vendorEmail={vendorEmail}
          backHref={backHref}
          existingDraft={existingDraft}
          existingBid={existingBid}
        />
      </div>
    </AppShell>
  )
}
