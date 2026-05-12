import { getMagicRFQAccess } from '@/lib/magic-rfq/service'
import Image from 'next/image'
import { MagicRFQFormClient } from './_components/MagicRFQFormClient'

function StatusCard({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <main
      className="min-h-screen px-4 py-10"
      style={{ background: 'radial-gradient(circle at top left, #fff3eb 0, transparent 30rem), linear-gradient(180deg, #f5f0eb 0%, #ede8e2 100%)' }}
    >
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl items-center">
        <div className="w-full rounded-2xl border bg-white p-8 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
          <Image src="/Rialto_Full_Logo_CLEAR.png" alt="Rialto" height={38} width={196} className="h-[38px] w-auto object-contain" />
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#8a9e96' }}>Secure Quote Form</p>
          <h1 className="mt-3 text-2xl font-semibold" style={{ color: '#1e3a2f' }}>{title}</h1>
          <p className="mt-2 text-sm" style={{ color: '#4a6358' }}>{body}</p>
        </div>
      </div>
    </main>
  )
}

export default async function MagicRFQPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const access = await getMagicRFQAccess(token)

  if (access.status === 'invalid') {
    return <StatusCard title="Invalid link" body="This secure quote form link could not be verified." />
  }
  if (access.status === 'revoked') {
    return <StatusCard title="Link revoked" body="This secure quote form link is no longer active." />
  }
  if (access.status === 'expired') {
    return <StatusCard title="Link expired" body="This quote form is no longer accepting updates because the RFQ deadline has passed." />
  }
  if (access.status === 'closed' || !access.rfq || !access.vendorEmail) {
    return <StatusCard title="RFQ closed" body="This RFQ is no longer open for quote submissions." />
  }

  return (
    <main
      className="min-h-screen"
      style={{ background: 'radial-gradient(circle at top left, #fff3eb 0, transparent 30rem), linear-gradient(180deg, #f5f0eb 0%, #ede8e2 100%)' }}
    >
      <MagicRFQFormClient
        token={token}
        rfq={access.rfq}
        projectName={access.projectName ?? 'Project'}
        vendorEmail={access.vendorEmail}
        initialVendorName={access.vendorName ?? ''}
        existingBid={access.existingBid ?? null}
        initialMessages={access.messages ?? []}
        submittedAt={access.submittedAt}
      />
    </main>
  )
}
