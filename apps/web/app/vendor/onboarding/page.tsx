import { getSession } from '@/lib/auth/session'
import { AppShell } from '@/components/layout/AppShell'
import { OnboardingForm } from './_components/OnboardingForm'

export const metadata = {
  title: 'Company Setup - Rialto Vendor',
}

export default async function OnboardingPage() {
  const session = await getSession()
  const name = session?.name ?? 'there'

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Welcome, {name.split(' ')[0]}!</h1>
          <p className="mt-1 text-sm text-gray-500">
            Tell us about your company so we can match you with the most relevant RFQs.
            You can always update this later in Settings.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <OnboardingForm name={name} />
        </div>
      </div>
    </AppShell>
  )
}
