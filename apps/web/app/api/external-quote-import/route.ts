import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getProject, saveRFQ, appendBidToRFQ } from '@/lib/store/contractor-store'
import { createExternalQuoteImport } from '@/lib/procurement/external-quote-import'
import { extractExternalQuoteImportText, isExcelImportFile, isPdfImportFile } from '@/lib/procurement/external-quote-file-text'

export const runtime = 'nodejs'

const MAX_IMPORT_BYTES = 8 * 1024 * 1024

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'contractor') {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const projectId = String(formData.get('projectId') ?? '')
    const file = formData.get('file')
    if (!projectId || !(file instanceof File)) {
      return NextResponse.json({ error: 'Upload a PDF or Excel quote file for a project.' }, { status: 400 })
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: 'Import file is empty.' }, { status: 400 })
    }
    if (file.size > MAX_IMPORT_BYTES) {
      return NextResponse.json({ error: 'Import file is too large. Use a file under 8 MB.' }, { status: 400 })
    }

    const project = await getProject(projectId)
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    if (project.owner_id !== session.userId && !(project.collaborator_ids ?? []).includes(session.userId)) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const isPdf = isPdfImportFile(file)
    const isExcel = isExcelImportFile(file)
    if (!isPdf && !isExcel) {
      return NextResponse.json({ error: 'Only PDF and Excel quote comparison imports are supported.' }, { status: 400 })
    }

    const text = await extractExternalQuoteImportText(file, buffer)
    if (!text.trim()) {
      return NextResponse.json({ error: 'No readable text or worksheet rows were found in this file.' }, { status: 400 })
    }

    const imported = createExternalQuoteImport({
      projectId,
      projectName: project.name,
      filename: file.name,
      sourceKind: isPdf ? 'pdf' : 'spreadsheet',
      text,
    })

    await saveRFQ(imported.rfq)
    for (const bid of imported.bids) {
      await appendBidToRFQ(imported.rfq.id, bid)
    }

    return NextResponse.json({
      rfqId: imported.rfq.id,
      lineItemCount: imported.rfq.line_items.length,
      vendorName: imported.bid.vendor_name,
      vendorCount: imported.bids.length,
      warnings: imported.warnings,
      redirectTo: `/contractor/projects/${projectId}/rfqs/${imported.rfq.id}`,
    })
  } catch (error) {
    console.error('External quote import failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import quote comparison.' },
      { status: 500 },
    )
  }
}
