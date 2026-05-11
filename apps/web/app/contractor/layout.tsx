import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { AppShell } from '@/components/layout/AppShell'

export default async function ContractorLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session || session.role !== 'contractor') {
    redirect('/login')
  }
  return <AppShell>{children}</AppShell>
}
