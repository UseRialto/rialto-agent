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
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Upload a file.' }, { status: 400 })
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await getDefaultAgentHttpService().extractDocument({
      user,
      filename: file.name,
      mimeType: file.type,
      buffer,
    })

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Document extraction failed.' },
      { status: 500 },
    )
  }
}
