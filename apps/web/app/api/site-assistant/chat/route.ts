import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'

const RIALTO_AGENT_API_URL = process.env.RIALTO_AGENT_API_URL ?? 'http://localhost:8787'

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

    const response = await fetch(`${RIALTO_AGENT_API_URL}/agent/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: {
          id: session.userId,
          contractorOrganizationId: session.userId,
          role: session.role === 'vendor' ? 'vendor' : 'estimator',
          name: session.name || 'Estimator',
          email: session.email || 'estimator@example.com',
        },
        messages,
      }),
    })
    const result = await response.json()
    return NextResponse.json(result, { status: response.status })
  } catch (error) {
    console.error('Site assistant chat failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate assistant reply.' },
      { status: 500 },
    )
  }
}
