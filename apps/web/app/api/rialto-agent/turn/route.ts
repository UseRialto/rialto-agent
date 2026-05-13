import { NextRequest, NextResponse } from 'next/server'
import { getDefaultAgentHttpService } from '@rialto-agent/agent/http-service'
import { getSession } from '@/lib/auth/session'

export const runtime = 'nodejs'

function userFromSession(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) return null
  return {
    id: session.userId,
    contractorOrganizationId: session.userId,
    role: session.role === 'vendor' ? 'vendor' as const : 'estimator' as const,
    name: session.name || 'Estimator',
    email: session.email || 'estimator@example.com',
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  const user = userFromSession(session)
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  try {
    const body = await request.json() as {
      messages?: Array<{ role?: string; content?: string }>
      currentPage?: { path?: string; title?: string }
      debug?: boolean
    }

    const messages = Array.isArray(body.messages)
      ? body.messages
          .filter((message) =>
            (message.role === 'user' || message.role === 'assistant') &&
            typeof message.content === 'string' &&
            message.content.trim(),
          )
          .map((message) => ({
            role: message.role,
            content: message.content!.trim(),
          }))
      : []

    if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
      return NextResponse.json({ error: 'Send a user message to start.' }, { status: 400 })
    }

    const result = await getDefaultAgentHttpService().runTurn({
      user,
      messages,
      currentPage: body.currentPage,
      debug: body.debug,
    })

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Rialto Agent turn failed.' },
      { status: 500 },
    )
  }
}
