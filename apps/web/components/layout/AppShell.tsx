import Image from 'next/image'
import Link from 'next/link'
import { BadgeCheck } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { SiteAssistant } from '@/components/site-assistant/SiteAssistant'
import { ProfileMenu } from '@/components/layout/ProfileMenu'

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  const isVendor = session?.role === 'vendor'
  const settingsHref = isVendor ? '/vendor/settings' : '/contractor/settings'
  const displayName = session?.name ?? 'User'
  const displayEmail = session?.email ?? ''

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
            {session && <ProfileMenu displayName={displayName} displayEmail={displayEmail} settingsHref={settingsHref} />}
          </div>
        </header>

        <main className="flex-1 overflow-auto px-6 pb-32 pt-6" style={{ background: `radial-gradient(circle at top left, #fff3eb 0, transparent 28rem), linear-gradient(180deg, #f5f0eb 0, #ede8e2 100%)` }}>
          {children}
        </main>
      </div>
      {session && <SiteAssistant storageScope={`${session.role}:${session.userId}`} />}
    </div>
  )
}
