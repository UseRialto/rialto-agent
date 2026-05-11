import { getSession } from '@/lib/auth/session'
import { disconnectMailboxOAuth } from '@/lib/mail/service'

export async function POST() {
  const session = await getSession()
  if (!session || session.role !== 'contractor') {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  disconnectMailboxOAuth(session.userId)
  return Response.json({ success: true })
}
