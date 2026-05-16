import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { getProject, saveRFQ, appendBidToRFQ } from '@/lib/store/contractor-store'
import { saveComparisonSheetView } from '@/lib/store/comparison-sheet-view-store'
import { DEFAULT_COMPARISON_SHEET_VIEW } from '@/lib/procurement/comparison-sheet-state'
import { buildImportedQuoteComparison, type QuoteComparisonImportUpload } from '@/lib/modules/quote-comparison/imported-quote-comparison'

export const runtime = 'nodejs'

const MAX_IMPORT_BYTES = 8 * 1024 * 1024
const MAX_IMPORT_FILES = 12
const MAX_TOTAL_IMPORT_BYTES = 32 * 1024 * 1024

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'contractor') {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const projectId = String(formData.get('projectId') ?? '')
    const rfqName = String(formData.get('rfqName') ?? '').trim()
    const files = formData.getAll('files').filter((value): value is File => value instanceof File)
    const legacyFile = formData.get('file')
    if (legacyFile instanceof File) files.push(legacyFile)
    const allFiles = files

    if (!projectId || allFiles.length === 0) {
      return NextResponse.json({ error: 'Upload a PDF, CSV, or Excel quote file for a project.' }, { status: 400 })
    }
    if (allFiles.length > MAX_IMPORT_FILES) {
      return NextResponse.json({ error: `Upload ${MAX_IMPORT_FILES} quote files or fewer at a time.` }, { status: 400 })
    }
    const totalBytes = allFiles.reduce((sum, file) => sum + file.size, 0)
    if (totalBytes > MAX_TOTAL_IMPORT_BYTES) {
      return NextResponse.json({ error: 'Import files are too large. Use a combined upload under 32 MB.' }, { status: 400 })
    }
    const emptyFile = allFiles.find((file) => file.size <= 0)
    if (emptyFile) {
      return NextResponse.json({ error: `${emptyFile.name} is empty.` }, { status: 400 })
    }
    const oversizedFile = allFiles.find((file) => file.size > MAX_IMPORT_BYTES)
    if (oversizedFile) {
      return NextResponse.json({ error: `${oversizedFile.name} is too large. Use files under 8 MB.` }, { status: 400 })
    }

    const project = await getProject(projectId)
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    if (project.owner_id !== session.userId && !(project.collaborator_ids ?? []).includes(session.userId)) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    }

    const uploadFiles: QuoteComparisonImportUpload[] = []
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      uploadFiles.push({
        name: file.name,
        type: file.type,
        buffer,
      })
    }
    const built = await buildImportedQuoteComparison({
      projectId,
      projectName: project.name,
      title: rfqName,
      files: uploadFiles,
    })
    const { imported, analyticsHighlights } = built

    await saveRFQ(imported.rfq)
    for (const bid of imported.bids) {
      await appendBidToRFQ(imported.rfq.id, bid)
    }
    if (analyticsHighlights.length > 0) {
      await saveComparisonSheetView(imported.rfq.id, {
        ...DEFAULT_COMPARISON_SHEET_VIEW,
        highlights: analyticsHighlights,
      }, {
        source: 'import',
        actorUserId: session.userId,
        actorName: session.name,
        summary: `Flagged ${analyticsHighlights.length} pricing mistake candidate${analyticsHighlights.length === 1 ? '' : 's'} from quote import analytics.`,
      })
    }
    revalidatePath(`/contractor/projects/${projectId}`)
    revalidatePath(`/contractor/projects/${projectId}/rfqs/${imported.rfq.id}`)

    const importMessage = built.diagnostics.usedAgentFallback
      ? 'Processed through the explicitly requested smart import agent.'
      : 'Processed correctly through the normal importer.'

    return NextResponse.json({
      rfqId: imported.rfq.id,
      lineItemCount: imported.rfq.line_items.length,
      vendorName: imported.bid.vendor_name,
      vendorCount: imported.bids.length,
      warnings: built.warnings,
      importDiagnostics: built.diagnostics,
      redirectTo: `/contractor/projects/${projectId}/rfqs/${imported.rfq.id}?importStatus=${built.diagnostics.usedAgentFallback ? 'fallback' : 'normal'}&importMessage=${encodeURIComponent(importMessage)}`,
    })
  } catch (error) {
    console.error('External quote import failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import quote comparison.' },
      { status: 500 },
    )
  }
}
