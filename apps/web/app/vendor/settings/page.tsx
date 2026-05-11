import { notFound } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { getSession } from '@/lib/auth/session'
import { findUserById } from '@/lib/auth/users'
import { ProfileForm } from './_components/ProfileForm'

export const metadata = {
  title: 'Settings - Rialto Vendor',
}

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) notFound()

  const user = await findUserById(session.userId)
  if (!user) notFound()

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <h1
            className="text-xl font-semibold"
            style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}
          >
            Account Settings
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: '#4a6358' }}>Manage your profile and account security.</p>
        </div>

        <ProfileForm user={user} />
      </div>
    </AppShell>
  )
}
