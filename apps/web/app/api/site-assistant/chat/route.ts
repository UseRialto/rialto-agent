import { NextRequest, NextResponse } from 'next/server'
import { getDefaultAgentHttpService } from '@rialto-agent/agent/http-service'
import { getSession } from '@/lib/auth/session'

export const runtime = 'nodejs'

interface ChatRequest {
  messages?: Array<{ role?: string; content?: string }>
}

function validMessages(messages: ChatRequest['messages']) {
  if (!Array.isArray(messages)) return []
  return messages
    .filter((message) =>
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string' &&
      message.content.trim(),
    )
    .slice(-16)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  try {
    const body = await request.json() as ChatRequest
    const messages = validMessages(body.messages)
    if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
      return NextResponse.json({ error: 'Send a user message to start.' }, { status: 400 })
    }

    const result = await getDefaultAgentHttpService().runTurn({
      user: {
        id: session.userId,
        contractorOrganizationId: session.userId,
        role: session.role === 'vendor' ? 'vendor' : 'estimator',
        name: session.name || 'Estimator',
        email: session.email || 'estimator@example.com',
      },
      messages,
    })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error('Site assistant chat failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate assistant reply.' },
      { status: 500 },
    )
  }
}
