import Image from 'next/image'
import Link from 'next/link'
import { BadgeCheck, LogOut, Settings } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { logoutAction } from '@/lib/actions/auth'
import { SiteAssistant } from '@/components/site-assistant/SiteAssistant'

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  const isVendor = session?.role === 'vendor'
  const settingsHref = isVendor ? '/vendor/settings' : '/contractor/settings'
  const displayName = session?.name ?? 'User'
  const displayEmail = session?.email ?? ''
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <div className="flex h-full min-h-screen" style={{ background: '#f5f0eb', color: '#1e3a2f' }}>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="relative z-50 flex h-16 items-center px-6 backdrop-blur" style={{ background: 'rgba(255,255,255,0.85)', borderBottom: '1px solid #e2d9cf' }}>
          <Link href={isVendor ? '/vendor/projects' : '/contractor/projects'}>
            <Image src="/Rialto_Full_Logo_CLEAR.png" alt="Rialto" height={36} width={185} className="h-9 w-auto object-contain" priority />
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs font-medium sm:flex" style={{ color: '#8a9e96' }}>
              <BadgeCheck className="h-3.5 w-3.5" style={{ color: '#fa6b04' }} />
              Quote requests and comparisons powered by AI
            </span>
            <span className="h-4 w-px" style={{ background: '#e2d9cf' }} />
            {session && (
              <details className="relative">
                <summary
                  className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full text-sm font-bold"
                  style={{ background: '#1e3a2f', color: '#ffffff', outline: '1px solid #e2d9cf' }}
                  title={displayName}
                >
                  {initial}
                </summary>
                <div className="absolute right-0 z-[100] mt-2 w-64 overflow-hidden rounded-xl border bg-white shadow-xl" style={{ borderColor: '#e2d9cf' }}>
                  <div className="px-4 py-3" style={{ borderBottom: '1px solid #ede8e2' }}>
                    <p className="truncate text-sm font-semibold" style={{ color: '#1e3a2f' }}>{displayName}</p>
                    {displayEmail && <p className="truncate text-xs" style={{ color: '#8a9e96' }}>{displayEmail}</p>}
                  </div>
                  <Link href={settingsHref} className="flex items-center gap-2 px-4 py-3 text-sm font-medium" style={{ color: '#4a6358' }}>
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                  <form action={logoutAction}>
                    <button type="submit" className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium" style={{ color: '#a85c2a', borderTop: '1px solid #ede8e2' }}>
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </form>
                </div>
              </details>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6" style={{ background: `radial-gradient(circle at top left, #fff3eb 0, transparent 28rem), linear-gradient(180deg, #f5f0eb 0, #ede8e2 100%)` }}>
          {children}
        </main>
      </div>
      {session && <SiteAssistant storageScope={`${session.role}:${session.userId}`} />}
    </div>
  )
}
