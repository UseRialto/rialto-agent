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
    const formData = await request.formData()
    const response = await fetch(`${RIALTO_AGENT_API_URL}/tools/document/extract`, {
      method: 'POST',
      headers: {
        'x-rialto-user': JSON.stringify(DEMO_USER),
      },
      body: formData,
    })

    const json = await response.json()
    return NextResponse.json(json, { status: response.status })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Document extraction failed.' },
      { status: 500 },
    )
  }
}
