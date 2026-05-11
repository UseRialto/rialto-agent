import { NextRequest } from 'next/server'
import { after } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getProject } from '@/lib/store/contractor-store'
import { getProjectSpecDocument, updateProjectSpecDocument } from '@/lib/spec-compliance/store'
import { indexProjectSpecDocument } from '@/lib/spec-compliance'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return Response.json({ error: 'Not authenticated.' }, { status: 401 })

    const body = await request.json() as { projectId?: string; documentId?: number }
    if (!body.projectId || !body.documentId) {
      return Response.json({ error: 'Missing project or document.' }, { status: 400 })
    }

    const [project, document] = await Promise.all([
      getProject(body.projectId),
      getProjectSpecDocument(body.documentId),
    ])
    if (!project || !document || document.project_id !== body.projectId) {
      return Response.json({ error: 'Spec document not found.' }, { status: 404 })
    }
    if (project.owner_id !== session.userId && !(project.collaborator_ids ?? []).includes(session.userId)) {
      return Response.json({ error: 'Not authorized.' }, { status: 403 })
    }
    if (document.status === 'indexed') {
      return Response.json({ status: document.status })
    }

    if (document.status === 'uploaded') {
      await updateProjectSpecDocument(document.id, { status: 'processing', extractionError: null })
    }

    after(async () => {
      try {
        await indexProjectSpecDocument(document.id)
      } catch (error) {
        console.error(`Project spec background indexing failed for document ${document.id}:`, error)
      }
    })

    return Response.json({ status: 'processing' }, { status: 202 })
  } catch (error) {
    console.error('Project spec indexing API failed:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Spec indexing failed.' },
      { status: 500 },
    )
  }
}
