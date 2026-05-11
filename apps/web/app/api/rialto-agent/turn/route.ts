import { NextRequest, NextResponse } from 'next/server'

const RIALTO_AGENT_API_URL = process.env.RIALTO_AGENT_API_URL ?? 'http://localhost:8787'

const DEMO_USER = {
  id: 'user-1',
  contractorOrganizationId: 'org-1',
  role: 'estimator',
  name: 'Estimator One',
  email: 'estimator@example.com',
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      messages?: Array<{ role?: string; content?: string }>
      currentPage?: { path?: string; title?: string }
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

    const response = await fetch(`${RIALTO_AGENT_API_URL}/agent/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: DEMO_USER,
        messages,
        currentPage: body.currentPage,
      }),
    })

    const json = await response.json()
    return NextResponse.json(json, { status: response.status })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Rialto Agent turn failed.' },
      { status: 500 },
    )
  }
}
