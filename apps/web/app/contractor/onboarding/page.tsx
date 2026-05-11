import { getSession } from '@/lib/auth/session'
import { findUserById } from '@/lib/auth/users'
import { ContractorOnboardingForm } from './_components/ContractorOnboardingForm'

export const metadata = {
  title: 'Contractor Setup - Rialto',
}

export default async function ContractorOnboardingPage() {
  const session = await getSession()
  const user = session ? await findUserById(session.userId) : null
  const name = user?.name ?? session?.name ?? 'there'

  return (
    <div className="mx-auto max-w-[88rem]">
      <div className="mb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#fa6b04' }}>Quick setup</p>
        <h1 className="mt-2 text-2xl font-semibold" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>
          Welcome, {name.split(' ')[0]}.
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm" style={{ color: '#4a6358' }}>
          Answer three quick questions so Rialto starts with the right material request fields for your team.
        </p>
      </div>

      <ContractorOnboardingForm
        initialCompanyName={user?.company_info?.company_name ?? ''}
        initialTrade={user?.company_info?.contractor_trade ?? ''}
      />
    </div>
  )
}
