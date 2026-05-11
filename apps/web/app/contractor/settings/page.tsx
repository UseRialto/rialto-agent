import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { findUserById } from '@/lib/auth/users'
import { ProfileForm } from '@/app/vendor/settings/_components/ProfileForm'
import { disconnectGoogleMailboxAction } from '@/lib/actions/contractor'
import { getContractorMailboxSummary } from '@/lib/mail/service'

export const metadata = {
  title: 'Settings - Rialto',
}

export default async function ContractorSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    google_connected?: string
    google_error?: string
    microsoft_connected?: string
    microsoft_error?: string
  }>
}) {
  const session = await getSession()
  if (!session) notFound()

  const user = await findUserById(session.userId)
  if (!user) notFound()
  const mailbox = await getContractorMailboxSummary(session.userId)
  const params = searchParams ? await searchParams : undefined
  const googleError = params?.google_error
  const microsoftError = params?.microsoft_error
  const googleConnected = params?.google_connected === '1'
  const microsoftConnected = params?.microsoft_connected === '1'
  const providerLabel = mailbox.provider === 'microsoft_365' ? 'Microsoft 365' : mailbox.provider === 'google' ? 'Google Workspace' : 'Mailbox'

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>Account Settings</h1>
        <p className="mt-0.5 text-sm" style={{ color: '#8a9e96' }}>Manage your profile and account security.</p>
      </div>

      <div className="mb-8 rounded-xl border bg-white p-6 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold" style={{ color: '#1e3a2f' }}>Connected Mailbox</h2>
            <p className="mt-1 text-sm" style={{ color: '#8a9e96' }}>
              Your connected Google Workspace or Microsoft 365 mailbox powers outbound RFQ email and inbound quote sync for this contractor account.
            </p>
          </div>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={mailbox.connected
              ? { background: '#e8f4ee', color: '#2d6a4f', border: '1px solid #a8d5ba' }
              : { background: '#ede8e2', color: '#8a9e96', border: '1px solid #e2d9cf' }}
          >
            {mailbox.connected ? `${providerLabel} Connected` : 'Not Connected'}
          </span>
        </div>

        {googleConnected && (
          <div className="mt-4 rounded-md border px-4 py-3" style={{ borderColor: '#a8d5ba', background: '#e8f4ee' }}>
            <p className="text-sm" style={{ color: '#2d6a4f' }}>Google account connected successfully.</p>
          </div>
        )}

        {microsoftConnected && (
          <div className="mt-4 rounded-md border px-4 py-3" style={{ borderColor: '#a8d5ba', background: '#e8f4ee' }}>
            <p className="text-sm" style={{ color: '#2d6a4f' }}>Microsoft 365 account connected successfully.</p>
          </div>
        )}

        {googleError && (
          <div className="mt-4 rounded-md border px-4 py-3" style={{ borderColor: '#f5c6c6', background: '#fdeaea' }}>
            <p className="text-sm" style={{ color: '#c0392b' }}>{googleError}</p>
          </div>
        )}

        {microsoftError && (
          <div className="mt-4 rounded-md border px-4 py-3" style={{ borderColor: '#f5c6c6', background: '#fdeaea' }}>
            <p className="text-sm" style={{ color: '#c0392b' }}>{microsoftError}</p>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border px-4 py-3" style={{ borderColor: '#e2d9cf', background: '#ede8e2' }}>
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8a9e96' }}>Account</p>
            <p className="mt-1 text-sm font-medium" style={{ color: '#1e3a2f' }}>{mailbox.emailAddress || 'Not connected'}</p>
          </div>
          <div className="rounded-lg border px-4 py-3" style={{ borderColor: '#e2d9cf', background: '#ede8e2' }}>
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8a9e96' }}>Sender</p>
            <p className="mt-1 text-sm font-medium" style={{ color: '#1e3a2f' }}>{mailbox.senderName || '-'}</p>
          </div>
          <div className="rounded-lg border px-4 py-3" style={{ borderColor: '#e2d9cf', background: '#ede8e2' }}>
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8a9e96' }}>Last Sync</p>
            <p className="mt-1 text-sm font-medium" style={{ color: '#1e3a2f' }}>
              {mailbox.lastSyncAt ? new Date(mailbox.lastSyncAt).toLocaleString() : 'Never'}
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border px-4 py-3" style={{ borderColor: '#e2d9cf', background: '#ede8e2' }}>
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8a9e96' }}>Connected At</p>
            <p className="mt-1 text-sm font-medium" style={{ color: '#1e3a2f' }}>
              {mailbox.connectedAt ? new Date(mailbox.connectedAt).toLocaleString() : '-'}
            </p>
          </div>
          <div className="rounded-lg border px-4 py-3" style={{ borderColor: '#e2d9cf', background: '#ede8e2' }}>
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8a9e96' }}>Provider</p>
            <p className="mt-1 text-sm font-medium" style={{ color: '#1e3a2f' }}>{mailbox.provider ? providerLabel : '-'}</p>
          </div>
          <div className="rounded-lg border px-4 py-3" style={{ borderColor: '#e2d9cf', background: '#ede8e2' }}>
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8a9e96' }}>OAuth Config</p>
            <p className="mt-1 text-sm font-medium" style={{ color: '#1e3a2f' }}>
              {mailbox.availableProviders.length > 0 ? mailbox.availableProviders.map((provider) => provider === 'microsoft_365' ? 'Microsoft 365' : 'Google').join(' + ') : 'No provider env vars configured'}
            </p>
          </div>
        </div>

        {!mailbox.availableProviders.length && (
          <div className="mt-4 rounded-md border px-4 py-3" style={{ borderColor: '#e8c4a0', background: '#fdf0e8' }}>
            <p className="text-sm" style={{ color: '#a85c2a' }}>
              Mailbox OAuth is not configured yet. Add Google (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and/or Microsoft (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`) environment variables, then restart the app.
            </p>
          </div>
        )}

        <div className="mt-4 rounded-md border px-4 py-3" style={{ borderColor: '#e2d9cf', background: '#ede8e2' }}>
          <p className="text-sm font-medium" style={{ color: '#1e3a2f' }}>Mailbox status</p>
          <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>
            Publishing an RFQ with off-platform recipients will immediately send invite emails from this exact mailbox address. Use this page to connect or reconnect the sender account, then use the RFQ detail page to resend invites or sync replies.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a
            href="/api/auth/google/start?from=/contractor/settings"
            className="rounded-md px-4 py-2 text-sm font-semibold text-white"
            style={mailbox.availableProviders.includes('google')
              ? { background: '#1e3a2f' }
              : { background: '#8a9e96', pointerEvents: 'none' }}
          >
            {mailbox.connected ? 'Reconnect Google' : 'Sign in with Google'}
          </a>
          <a
            href="/api/auth/microsoft/start?from=/contractor/settings"
            className="rounded-md px-4 py-2 text-sm font-semibold text-white"
            style={mailbox.availableProviders.includes('microsoft_365')
              ? { background: '#4a6358' }
              : { background: '#8a9e96', pointerEvents: 'none' }}
          >
            {mailbox.provider === 'microsoft_365' && mailbox.connected ? 'Reconnect Microsoft 365' : 'Sign in with Microsoft 365'}
          </a>
          {mailbox.connected && (
            <form action={disconnectGoogleMailboxAction}>
              <button
                type="submit"
                className="rounded-md border bg-white px-4 py-2 text-sm font-medium"
                style={{ borderColor: '#e2d9cf', color: '#4a6358' }}
              >
                Disconnect
              </button>
            </form>
          )}
        </div>
      </div>

      <ProfileForm user={user} />
    </div>
  )
}
