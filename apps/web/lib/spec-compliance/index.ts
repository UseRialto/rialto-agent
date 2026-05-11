import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bids as bidsTable } from '@/lib/db/schema'
import { getBidsForRFQ, getRFQById } from '@/lib/store/contractor-store'
import type { ContractorBid, ContractorBidLineItemResponse, ContractorRFQLineItem } from '@/lib/types/contractor'
import type { BidSpecComplianceSummaryStatus } from '@/lib/types/procurement'
import { chunkExtractedPages } from './chunk'
import { evaluateLineItemCompliance, configuredComplianceModel } from './llm'
import { extractPdfPages } from './pdf'
import { buildVendorProductProfile, enrichVendorProductProfile } from './product'
import {
  countIndexedSpecChunks,
  countOversizedSpecChunks,
  getProjectSpecDocument,
  listProjectSpecDocuments,
  replaceProjectSpecChunks,
  retrieveSpecChunksDetailed,
  saveComplianceReport,
  saveNoSpecsComplianceReport,
  updateProjectSpecDocument,
} from './store'
import type { ComplianceEvaluationResult, VendorProductProfile } from './types'

function compact(value?: string | number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function responseQuery(item: ContractorRFQLineItem, response: ContractorBidLineItemResponse) {
  return [
    item.sku,
    item.description,
    item.specs,
    item.constraints,
    item.certifications?.join(' '),
    item.notes,
    response.description,
    response.quoted_product_details,
    response.substitution_notes,
    response.notes,
  ].map(compact).filter(Boolean).join(' ')
}

function productProfileQuery(profile: VendorProductProfile) {
  return [
    profile.requested_sku,
    profile.requested_description,
    profile.requested_specs,
    profile.vendor_sku,
    profile.vendor_description,
    profile.quoted_product_details,
    profile.substitution_notes,
    profile.vendor_notes,
    profile.manufacturer,
    profile.model,
    profile.lookup?.summary,
    ...(profile.lookup?.results ?? []).flatMap((result) => [result.title, result.snippet]),
  ].map(compact).filter(Boolean).join(' ')
}

function positive(value: unknown) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) && number > 0
}

function isQuotedResponse(response: ContractorBidLineItemResponse) {
  if (response.availability === 'unavailable') return false
  return positive(response.quoted_quantity ?? response.quantity)
    || positive(response.units_available)
    || positive(response.total_price)
}

function notQuotedResult(
  lineItem: ContractorRFQLineItem,
  response: ContractorBidLineItemResponse,
): ComplianceEvaluationResult & { rfq_line_item_id?: string } {
  const reason = response.availability === 'unavailable'
    ? 'The vendor marked this line item unavailable.'
    : 'The vendor did not provide a positive quoted or available quantity for this line item.'
  return {
    rfq_line_item_id: lineItem.id,
    status: 'not_quoted',
    severity: 'low',
    requirement_summary: 'Spec compliance was not evaluated because the vendor did not quote this line item.',
    vendor_summary: compact(response.notes) || compact(response.substitution_notes) || reason,
    explanation: reason,
    suggested_follow_up: 'No spec comparison is needed unless the vendor later provides a quote for this item.',
    evidence: [],
    retrieval_diagnostics: {
      query: responseQuery(lineItem, response),
      skipped_reason: reason,
      methods: [],
      candidates: [],
    },
    product_lookup: { status: 'skipped', error: 'Product lookup skipped because the item was not quoted.' },
  }
}

function summarize(items: ComplianceEvaluationResult[]): BidSpecComplianceSummaryStatus {
  const evaluable = items.filter((item) => item.status !== 'not_quoted')
  if (evaluable.some((item) => item.status === 'violation')) return 'violation'
  if (evaluable.some((item) => item.status === 'needs_review')) return 'needs_review'
  if (evaluable.some((item) => item.status === 'compliant')) return 'compliant'
  if (evaluable.length > 0) return 'no_spec_found'
  if (items.some((item) => item.status === 'not_quoted')) return 'not_quoted'
  return 'no_spec_found'
}

async function getBidForAnalysis(bidId: string): Promise<{ rfqId: string; bid?: ContractorBid }> {
  const row = (await db
    .select({ rfq_id: bidsTable.rfq_id })
    .from(bidsTable)
    .where(eq(bidsTable.id, bidId)))[0]
  if (!row) return { rfqId: '' }
  const bids = await getBidsForRFQ(row.rfq_id)
  return { rfqId: row.rfq_id, bid: bids.find((bid) => bid.id === bidId) }
}

export async function indexProjectSpecDocument(documentId: number): Promise<void> {
  const document = await getProjectSpecDocument(documentId)
  if (!document) throw new Error('Spec document not found.')
  await updateProjectSpecDocument(documentId, { status: 'processing', extractionError: null })

  try {
    const extracted = await extractPdfPages(document.file_url)
    const chunks = chunkExtractedPages(extracted.pages)
    await replaceProjectSpecChunks(document.id, document.project_id, chunks)
    await updateProjectSpecDocument(documentId, {
      status: 'indexed',
      pageCount: extracted.pageCount,
      extractionError: chunks.length === 0 ? 'No extractable text was found in this PDF.' : null,
    })
  } catch (error) {
    await updateProjectSpecDocument(documentId, {
      status: 'failed',
      extractionError: error instanceof Error ? error.message : 'Failed to index spec document.',
    })
    throw error
  }
}

export async function runBidSpecCompliance(bidId: string) {
  const { rfqId, bid } = await getBidForAnalysis(bidId)
  if (!bid || !rfqId) return undefined
  const rfq = await getRFQById(rfqId)
  if (!rfq) return undefined

  let indexedChunkCount = await countIndexedSpecChunks(rfq.project_id)
  let oversizedChunkCount = indexedChunkCount > 0 ? await countOversizedSpecChunks(rfq.project_id) : 0
  if (indexedChunkCount === 0 || oversizedChunkCount > 0) {
    const documents = await listProjectSpecDocuments(rfq.project_id)
    const documentsToIndex = indexedChunkCount === 0
      ? documents.filter((document) => document.status !== 'indexed')
      : documents.filter((document) => document.status === 'indexed')
    for (const document of documentsToIndex) {
      try {
        await indexProjectSpecDocument(document.id)
      } catch (error) {
        console.error(`Spec indexing retry failed for ${document.filename}:`, error)
      }
    }
    indexedChunkCount = await countIndexedSpecChunks(rfq.project_id)
    oversizedChunkCount = indexedChunkCount > 0 ? await countOversizedSpecChunks(rfq.project_id) : 0
  }
  if (indexedChunkCount === 0) {
    return saveNoSpecsComplianceReport({ bidId: bid.id, rfqId: rfq.id, projectId: rfq.project_id })
  }

  const items: Array<ComplianceEvaluationResult & { rfq_line_item_id?: string }> = []
  for (const response of bid.line_item_responses) {
    const lineItem = rfq.line_items.find((item) => item.id === response.line_item_id)
    if (!lineItem) continue
    if (!isQuotedResponse(response)) {
      items.push(notQuotedResult(lineItem, response))
      continue
    }

    const productProfile = await enrichVendorProductProfile(buildVendorProductProfile(lineItem, response))
    const query = [
      responseQuery(lineItem, response),
      productProfileQuery(productProfile),
    ].map(compact).filter(Boolean).join(' ')
    const retrieval = await retrieveSpecChunksDetailed(rfq.project_id, query, 7)
    const chunks = retrieval.chunks
    if (chunks.length === 0) {
      items.push({
        rfq_line_item_id: lineItem.id,
        status: 'no_spec_found',
        severity: 'low',
        requirement_summary: 'No matching specification text was found for this line item.',
        vendor_summary: compact(response.quoted_product_details) || compact(response.notes) || 'No vendor product details provided.',
        explanation: 'The indexed project specs did not return evidence for this requested SKU/product.',
        suggested_follow_up: 'If this item should be governed by the spec manual, confirm the RFQ description or SKU has enough searchable detail.',
        evidence: [],
        retrieval_diagnostics: retrieval.diagnostics,
        product_lookup: productProfile.lookup,
      })
      continue
    }
    try {
      const result = await evaluateLineItemCompliance({
        rfq,
        bid,
        lineItem,
        response,
        chunks,
        productProfile,
        retrievalDiagnostics: retrieval.diagnostics,
      })
      items.push({ ...result, rfq_line_item_id: lineItem.id })
    } catch (error) {
      items.push({
        rfq_line_item_id: lineItem.id,
        status: 'needs_review',
        severity: 'high',
        requirement_summary: 'Relevant spec text was retrieved, but automated AI analysis failed.',
        vendor_summary: compact(response.quoted_product_details) || compact(response.notes) || 'No vendor product details provided.',
        explanation: error instanceof Error ? error.message : 'Automated compliance analysis failed.',
        suggested_follow_up: 'Fix the AI provider/model configuration or review the cited specification pages manually before award.',
        evidence: chunks.slice(0, 3).map((chunk) => ({
          document_id: chunk.document_id,
          document_name: chunk.document_name,
          page_start: chunk.page_start,
          page_end: chunk.page_end,
          section_number: chunk.section_number,
          section_title: chunk.section_title,
          quote: chunk.content.slice(0, 350),
        })),
        retrieval_diagnostics: retrieval.diagnostics,
        product_lookup: productProfile.lookup,
      })
    }
  }

  return saveComplianceReport({
    bidId: bid.id,
    rfqId: rfq.id,
    projectId: rfq.project_id,
    status: 'complete',
    summaryStatus: summarize(items),
    model: configuredComplianceModel(),
    items,
  })
}
