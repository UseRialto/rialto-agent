import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { buildSiteAssistantContext } from '@/lib/site-assistant/context'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  try {
    const context = await buildSiteAssistantContext(session)
    return NextResponse.json({ context })
  } catch (error) {
    console.error('Site assistant context failed:', error)
    return NextResponse.json(
      { error: 'Failed to build assistant context.' },
      { status: 500 },
    )
  }
}
