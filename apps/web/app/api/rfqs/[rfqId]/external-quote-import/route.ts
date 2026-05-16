import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { appendBidToRFQ, appendRFQLineItemsAndInvites, getBidsForRFQ, getProject, getRFQ } from '@/lib/store/contractor-store'
import { mergeExternalQuoteImportIntoRFQ } from '@/lib/procurement/external-quote-import'
import { buildImportedQuoteComparison, type QuoteComparisonImportUpload } from '@/lib/modules/quote-comparison/imported-quote-comparison'

export const runtime = 'nodejs'

const MAX_IMPORT_BYTES = 8 * 1024 * 1024
const MAX_IMPORT_FILES = 12
const MAX_TOTAL_IMPORT_BYTES = 32 * 1024 * 1024

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ rfqId: string }> },
) {
  const session = await getSession()
  if (!session || session.role !== 'contractor') {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  try {
    const { rfqId } = await params
    const formData = await request.formData()
    const files = formData.getAll('files').filter((value): value is File => value instanceof File)
    const legacyFile = formData.get('file')
    if (legacyFile instanceof File) files.push(legacyFile)

    if (files.length === 0) {
      return NextResponse.json({ error: 'Upload at least one quote file.' }, { status: 400 })
    }
    if (files.length > MAX_IMPORT_FILES) {
      return NextResponse.json({ error: `Upload ${MAX_IMPORT_FILES} quote files or fewer at a time.` }, { status: 400 })
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
    if (totalBytes > MAX_TOTAL_IMPORT_BYTES) {
      return NextResponse.json({ error: 'Import files are too large. Use a combined upload under 32 MB.' }, { status: 400 })
    }
    const emptyFile = files.find((file) => file.size <= 0)
    if (emptyFile) {
      return NextResponse.json({ error: `${emptyFile.name} is empty.` }, { status: 400 })
    }
    const oversizedFile = files.find((file) => file.size > MAX_IMPORT_BYTES)
    if (oversizedFile) {
      return NextResponse.json({ error: `${oversizedFile.name} is too large. Use files under 8 MB.` }, { status: 400 })
    }

    const rfq = await getRFQ(rfqId)
    if (!rfq) return NextResponse.json({ error: 'Quote comparison not found.' }, { status: 404 })
    const project = await getProject(rfq.project_id)
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    if (project.owner_id !== session.userId && !(project.collaborator_ids ?? []).includes(session.userId)) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    }

    const uploadFiles: QuoteComparisonImportUpload[] = []
    for (const file of files) {
      uploadFiles.push({
        name: file.name,
        type: file.type,
        buffer: Buffer.from(await file.arrayBuffer()),
      })
    }

    const built = await buildImportedQuoteComparison({
      projectId: rfq.project_id,
      projectName: project.name,
      title: rfq.title,
      files: uploadFiles,
    })
    const existingBids = await getBidsForRFQ(rfq.id)
    const merged = mergeExternalQuoteImportIntoRFQ({
      targetRfq: rfq,
      existingBids,
      imported: built.imported,
    })

    await appendRFQLineItemsAndInvites(rfq.id, addedLineItemsWithoutExisting(merged.addedLineItems, rfq.line_items), [])
    for (const bid of merged.bids) {
      await appendBidToRFQ(rfq.id, bid)
    }

    revalidatePath(`/contractor/projects/${rfq.project_id}`)
    revalidatePath(`/contractor/projects/${rfq.project_id}/rfqs/${rfq.id}`)

    const importMessage = built.diagnostics.usedAgentFallback
      ? 'Processed through the explicitly requested smart import agent.'
      : `Added ${merged.bids.length} quote import${merged.bids.length === 1 ? '' : 's'} through the normal importer.`

    return NextResponse.json({
      rfqId: rfq.id,
      lineItemCount: merged.rfq.line_items.length,
      addedLineItemCount: merged.addedLineItems.length,
      vendorCount: existingBids.length + merged.bids.length,
      addedVendorCount: merged.bids.length,
      warnings: uniqueWarnings([...merged.warnings, ...built.warnings]),
      importDiagnostics: built.diagnostics,
      redirectTo: `/contractor/projects/${rfq.project_id}/rfqs/${rfq.id}?importStatus=${built.diagnostics.usedAgentFallback ? 'fallback' : 'normal'}&importMessage=${encodeURIComponent(importMessage)}`,
    })
  } catch (error) {
    console.error('External quote append failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add quote import.' },
      { status: 500 },
    )
  }
}

function addedLineItemsWithoutExisting<T extends { id: string }>(added: T[], existing: T[]) {
  const existingIds = new Set(existing.map((line) => line.id))
  return added.filter((line) => !existingIds.has(line.id))
}

function uniqueWarnings(warnings: Array<{ message: string; row?: number }>) {
  const seen = new Set<string>()
  return warnings.filter((warning) => {
    const key = `${warning.row ?? ''}:${warning.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
