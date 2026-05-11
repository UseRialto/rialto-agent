import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bidSpecComplianceItems,
  bidSpecComplianceReports,
  projectSpecChunks,
  projectSpecDocuments,
} from '@/lib/db/schema'
import type {
  BidSpecComplianceEvidence,
  BidSpecComplianceItem,
  BidSpecComplianceReport,
  BidSpecComplianceSummaryStatus,
  ProjectSpecDocumentStatus,
  ProjectSpecDocumentSummary,
  SpecProductLookupResult,
  SpecRetrievalDiagnostics,
} from '@/lib/types/procurement'
import { generateEmbedding, generateEmbeddings } from './embeddings'
import type { ComplianceEvaluationResult, RetrievedSpecChunk, RetrievalCandidateDiagnostic, RetrievalResult, SpecChunkInput } from './types'

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function rowToSpecDocument(row: typeof projectSpecDocuments.$inferSelect): ProjectSpecDocumentSummary {
  return {
    id: row.id,
    project_id: row.project_id,
    filename: row.filename,
    file_url: row.file_url,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes ?? undefined,
    page_count: row.page_count ?? undefined,
    status: row.status as ProjectSpecDocumentStatus,
    extraction_error: row.extraction_error ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function rowToComplianceItem(row: typeof bidSpecComplianceItems.$inferSelect): BidSpecComplianceItem {
  return {
    id: row.id,
    report_id: row.report_id,
    bid_id: row.bid_id,
    rfq_line_item_id: row.rfq_line_item_id ?? undefined,
    status: row.status as BidSpecComplianceItem['status'],
    severity: row.severity as BidSpecComplianceItem['severity'],
    requirement_summary: row.requirement_summary,
    vendor_summary: row.vendor_summary,
    explanation: row.explanation,
    suggested_follow_up: row.suggested_follow_up ?? undefined,
    evidence: parseJson<BidSpecComplianceEvidence[]>(row.evidence_json, []),
    retrieval_diagnostics: parseJson<SpecRetrievalDiagnostics>(row.retrieval_diagnostics_json, {}),
    product_lookup: parseJson<SpecProductLookupResult>(row.product_lookup_json, { status: 'skipped' }),
    created_at: row.created_at,
  }
}

async function reportWithItems(row: typeof bidSpecComplianceReports.$inferSelect): Promise<BidSpecComplianceReport> {
  const items = await db
    .select()
    .from(bidSpecComplianceItems)
    .where(eq(bidSpecComplianceItems.report_id, row.id))
  return {
    id: row.id,
    bid_id: row.bid_id,
    rfq_id: row.rfq_id,
    project_id: row.project_id,
    status: row.status as BidSpecComplianceReport['status'],
    summary_status: row.summary_status as BidSpecComplianceSummaryStatus,
    high_severity_count: row.high_severity_count,
    checked_at: row.checked_at,
    model: row.model ?? undefined,
    error: row.error ?? undefined,
    items: items.map(rowToComplianceItem),
  }
}

export async function createProjectSpecDocument(input: {
  projectId: string
  filename: string
  fileUrl: string
  mimeType?: string
  sizeBytes?: number
}): Promise<ProjectSpecDocumentSummary> {
  const now = new Date().toISOString()
  const row = (await db
    .insert(projectSpecDocuments)
    .values({
      project_id: input.projectId,
      filename: input.filename,
      file_url: input.fileUrl,
      mime_type: input.mimeType ?? 'application/pdf',
      size_bytes: input.sizeBytes ?? null,
      status: 'uploaded',
      created_at: now,
      updated_at: now,
    })
    .returning())[0]
  return rowToSpecDocument(row)
}

export async function listProjectSpecDocuments(projectId: string): Promise<ProjectSpecDocumentSummary[]> {
  const rows = await db
    .select()
    .from(projectSpecDocuments)
    .where(eq(projectSpecDocuments.project_id, projectId))
    .orderBy(desc(projectSpecDocuments.created_at))
  return rows.map(rowToSpecDocument)
}

export async function updateProjectSpecDocument(
  documentId: number,
  updates: {
    status?: ProjectSpecDocumentStatus
    pageCount?: number
    extractionError?: string | null
  },
) {
  await db
    .update(projectSpecDocuments)
    .set({
      status: updates.status,
      page_count: updates.pageCount,
      extraction_error: updates.extractionError,
      updated_at: new Date().toISOString(),
    })
    .where(eq(projectSpecDocuments.id, documentId))
}

export async function getProjectSpecDocument(documentId: number): Promise<ProjectSpecDocumentSummary | null> {
  const row = (await db
    .select()
    .from(projectSpecDocuments)
    .where(eq(projectSpecDocuments.id, documentId)))[0]
  return row ? rowToSpecDocument(row) : null
}

export async function replaceProjectSpecChunks(documentId: number, projectId: string, chunks: SpecChunkInput[]) {
  await db.delete(projectSpecChunks).where(eq(projectSpecChunks.document_id, documentId))
  if (chunks.length === 0) return
  const now = new Date().toISOString()
  const embeddings = await generateEmbeddings(chunks.map((chunk) => [
    chunk.section_number,
    chunk.section_title,
    chunk.content,
  ].filter(Boolean).join('\n').slice(0, 8_000)))

  await db.insert(projectSpecChunks).values(
    chunks.map((chunk, index) => ({
      document_id: documentId,
      project_id: projectId,
      chunk_index: chunk.chunk_index,
      parent_chunk_id: chunk.parent_chunk_id ?? null,
      chunk_type: chunk.chunk_type ?? 'child',
      page_start: chunk.page_start,
      page_end: chunk.page_end,
      section_number: chunk.section_number ?? null,
      canonical_section_number: chunk.canonical_section_number ?? normalizeSectionNumber(chunk.section_number ?? ''),
      section_title: chunk.section_title ?? null,
      token_count: chunk.token_count ?? Math.max(1, Math.ceil(chunk.content.length / 4)),
      content: chunk.content,
      embedding: chunk.embedding ?? embeddings[index] ?? null,
      created_at: now,
    })),
  )
}

export async function countIndexedSpecChunks(projectId: string): Promise<number> {
  const row = (await db
    .select({ count: sql<number>`count(*)` })
    .from(projectSpecChunks)
    .where(eq(projectSpecChunks.project_id, projectId)))[0]
  return Number(row?.count ?? 0)
}

export async function countOversizedSpecChunks(projectId: string): Promise<number> {
  const row = (await db
    .select({ count: sql<number>`count(*)` })
    .from(projectSpecChunks)
    .where(and(
      eq(projectSpecChunks.project_id, projectId),
      eq(projectSpecChunks.chunk_type, 'child'),
      sql`${projectSpecChunks.token_count} > 1300`,
    )))[0]
  return Number(row?.count ?? 0)
}

function normalizeSectionNumber(value: string) {
  return value.replace(/[^0-9]/g, '')
}

function sectionNumbersFromQuery(query: string) {
  const matches = query.matchAll(/\b(?:section\s*)?([0-9]{2}\s?[0-9]{2}\s?[0-9]{2}|[0-9]{6})\b/gi)
  return [...new Set([...matches].map((match) => normalizeSectionNumber(match[1])))]
}

const STOP_WORDS = new Set([
  'and',
  'are',
  'basis',
  'board',
  'days',
  'design',
  'for',
  'from',
  'include',
  'included',
  'item',
  'must',
  'none',
  'only',
  'product',
  'provide',
  'requested',
  'section',
  'shall',
  'the',
  'this',
  'vendor',
  'with',
])

function tsQueryFromKeywords(query: string) {
  const tokens = query
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .slice(0, 18) ?? []
  const unique = [...new Set(tokens)]
  if (unique.length === 0) return ''
  return unique.map((token) => `${token}:*`).join(' | ')
}

function rowToRetrievedSpecChunk(row: {
  id: number
  document_id: number
  document_name: string
  page_start: number
  page_end: number
  section_number: string | null
  canonical_section_number?: string | null
  section_title: string | null
  content: string
  rank?: number | string | null
  method?: string | null
}): RetrievedSpecChunk {
  return {
    id: row.id,
    document_id: row.document_id,
    document_name: row.document_name,
    page_start: row.page_start,
    page_end: row.page_end,
    section_number: row.section_number ?? undefined,
    canonical_section_number: row.canonical_section_number ?? undefined,
    section_title: row.section_title ?? undefined,
    content: row.content,
    rank: Number(row.rank ?? 0),
    method: row.method ?? undefined,
  }
}

function expandedQueryText(query: string) {
  const normalized = query.replace(/\s+/g, ' ').trim()
  const expansions: Record<string, string[]> = {
    markerboard: ['whiteboard', 'writing surface', 'visual display surface', 'visual display surfaces', 'porcelain enamel', '10 11 00', '101100'],
    whiteboard: ['markerboard', 'writing surface', 'visual display surface', 'visual display surfaces', 'porcelain enamel', '10 11 00', '101100'],
    tackboard: ['cork board', 'tack surface', 'bulletin board', 'visual display surface', 'visual display surfaces', '10 11 00', '101100'],
    cork: ['tackboard', 'bulletin board', 'cork board'],
    maprail: ['map rail', 'display rail', 'trim'],
    porcelain: ['porcelain enamel steel', 'ceramic steel', 'markerboard', 'visual display surfaces'],
    music: ['staff lines', 'music staff', 'stave'],
    porc: ['porcelain enamel steel', 'markerboard', 'visual display surfaces'],
    mb: ['markerboard', 'whiteboard', 'visual display surfaces'],
    tb: ['tackboard', 'cork board', 'bulletin board', 'visual display surfaces'],
  }
  const lowered = normalized.toLowerCase()
  const extra = Object.entries(expansions)
    .filter(([term]) => new RegExp(`\\b${term}\\b`, 'i').test(lowered) || lowered.includes(`${term}-`))
    .flatMap(([, values]) => values)
  return [...new Set([normalized, ...extra])].join(' ')
}

function normalizedText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function phraseHit(text: string, phrase: string) {
  return normalizedText(text).includes(normalizedText(phrase))
}

function importantQueryTerms(query: string) {
  const tokens = normalizedText(query).split(' ')
  return [...new Set(tokens.filter((token) => (
    token.length >= 5 &&
    !STOP_WORDS.has(token) &&
    !/^\d+$/.test(token) &&
    !/[a-z]+\d|\d+[a-z]+/.test(token)
  )))].slice(0, 18)
}

type RetrievalTopicProfile = {
  name: string
  triggers: string[]
  requiredPhrases: string[]
  rejectPhrases: string[]
}

const TOPIC_PROFILES: RetrievalTopicProfile[] = [
  {
    name: 'visual_display_surfaces',
    triggers: [
      'visual display', 'markerboard', 'whiteboard', 'writing surface', 'tackboard', 'cork board',
      'bulletin board', 'porcelain enamel', 'porcelain enamel steel', 'map rail', 'maprail',
      'music staff', 'stave', 'mb-', 'tb-', 'porc', 'cork', 'tray-marker', 'hook-map', 'flag-holder',
    ],
    requiredPhrases: [
      'visual display', 'markerboard', 'whiteboard', 'writing surface', 'tackboard', 'cork',
      'bulletin board', 'porcelain enamel', 'map rail', 'maprail', 'display rail', 'marker tray',
      'chalk tray', 'flag holder', 'music staff', 'stave',
    ],
    rejectPhrases: [
      'hazardous materials', 'abatement', 'asbestos', 'lead based paint', 'lead-based paint',
      'hollow metal doors', 'doors and frames', 'plumbing fixtures', 'hydronic piping',
      'mechanical equipment', 'fire alarm', 'masonry', 'plaster',
    ],
  },
]

function topicProfilesForQuery(query: string) {
  return TOPIC_PROFILES.filter((profile) => profile.triggers.some((trigger) => phraseHit(query, trigger)))
}

function chunkSearchText(chunk: RetrievedSpecChunk) {
  return [
    chunk.section_number,
    chunk.section_title,
    chunk.content.slice(0, 3_000),
  ].filter(Boolean).join(' ')
}

function scoreChunkRelevance(chunk: RetrievedSpecChunk, query: string, sections: string[], exactSectionAvailable: boolean) {
  if (exactSectionAvailable && (!chunk.canonical_section_number || !sections.includes(chunk.canonical_section_number))) {
    return { score: 0, relevant: false }
  }
  if (sections.length > 0 && chunk.canonical_section_number && sections.includes(chunk.canonical_section_number)) {
    return { score: 100, relevant: true }
  }

  const text = chunkSearchText(chunk)
  const profiles = topicProfilesForQuery(query)
  const queryTerms = importantQueryTerms(query)
  const method = chunk.method ?? ''
  const baseScore = method === 'section' ? 50 : method === 'fts' ? 8 : method === 'loose' ? 5 : method === 'semantic' ? 2 : 0
  const rankScore = Number.isFinite(chunk.rank ?? NaN) ? Number(chunk.rank) : 0
  const termHits = queryTerms.filter((term) => phraseHit(text, term)).length

  let profileScore = 0
  let rejectedByProfile = false
  for (const profile of profiles) {
    const requiredHits = profile.requiredPhrases.filter((phrase) => phraseHit(text, phrase)).length
    const rejected = profile.rejectPhrases.some((phrase) => phraseHit(text, phrase))
    if (requiredHits === 0) rejectedByProfile = true
    if (rejected && requiredHits === 0) rejectedByProfile = true
    profileScore += requiredHits * 12
  }

  const score = baseScore + profileScore + termHits * 2 + rankScore
  const relevant = profiles.length > 0
    ? !rejectedByProfile && profileScore > 0
    : method === 'section' || method === 'fts' || method === 'loose' || termHits >= 2 || rankScore >= 0.62

  return { score, relevant }
}

function rankedRelevantChunks(chunks: RetrievedSpecChunk[], query: string, sections: string[], limit: number) {
  const exactSectionAvailable = sections.length > 0 && chunks.some((chunk) => (
    chunk.canonical_section_number && sections.includes(chunk.canonical_section_number)
  ))
  return chunks
    .map((chunk, originalIndex) => ({ chunk, originalIndex, ...scoreChunkRelevance(chunk, query, sections, exactSectionAvailable) }))
    .filter((entry) => entry.relevant)
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
    .slice(0, limit)
    .map((entry) => ({ ...entry.chunk, rank: entry.score }))
}

function candidateDiagnostic(chunk: RetrievedSpecChunk, method: string): RetrievalCandidateDiagnostic {
  return {
    chunk_id: chunk.id,
    document_name: chunk.document_name,
    page_start: chunk.page_start,
    page_end: chunk.page_end,
    section_number: chunk.section_number,
    section_title: chunk.section_title,
    score: chunk.rank,
    method,
  }
}

async function addAdjacentSectionChunks(
  projectId: string,
  chunks: RetrievedSpecChunk[],
  results: Map<number, RetrievedSpecChunk>,
  limit: number,
) {
  const sections = [...new Set(chunks.map((chunk) => chunk.canonical_section_number).filter(Boolean) as string[])]
  if (sections.length === 0 || results.size >= limit) return

  const rows = await db
    .select({
      id: projectSpecChunks.id,
      document_id: projectSpecChunks.document_id,
      document_name: projectSpecDocuments.filename,
      page_start: projectSpecChunks.page_start,
      page_end: projectSpecChunks.page_end,
      section_number: projectSpecChunks.section_number,
      canonical_section_number: projectSpecChunks.canonical_section_number,
      section_title: projectSpecChunks.section_title,
      content: projectSpecChunks.content,
      rank: sql<number>`0.2`,
      method: sql<string>`'adjacent_section'`,
    })
    .from(projectSpecChunks)
    .innerJoin(projectSpecDocuments, eq(projectSpecChunks.document_id, projectSpecDocuments.id))
    .where(and(
      eq(projectSpecChunks.project_id, projectId),
      eq(projectSpecChunks.chunk_type, 'child'),
      inArray(projectSpecChunks.canonical_section_number, sections),
    ))
    .orderBy(projectSpecChunks.page_start, projectSpecChunks.chunk_index)
    .limit(limit)

  for (const row of rows) {
    if (results.size >= limit) break
    if (!results.has(row.id)) results.set(row.id, rowToRetrievedSpecChunk(row))
  }
}

export async function retrieveSpecChunksDetailed(projectId: string, query: string, limit = 7): Promise<RetrievalResult> {
  const trimmed = query.replace(/\s+/g, ' ').trim()
  if (!trimmed) {
    return { chunks: [], diagnostics: { query, skipped_reason: 'Empty retrieval query.' } }
  }
  const expanded = expandedQueryText(trimmed)
  const vector = sql`to_tsvector('english', coalesce(${projectSpecChunks.section_number},'') || ' ' || coalesce(${projectSpecChunks.section_title},'') || ' ' || coalesce(${projectSpecChunks.content},''))`
  const results = new Map<number, RetrievedSpecChunk>()
  const diagnostics: SpecRetrievalDiagnostics = {
    query: trimmed,
    expanded_query: expanded,
    section_numbers: sectionNumbersFromQuery(expanded),
    methods: [],
    candidates: [],
    errors: [],
  }

  const sections = sectionNumbersFromQuery(expanded)
  if (sections.length > 0) {
    const sectionRows = await db
      .select({
        id: projectSpecChunks.id,
        document_id: projectSpecChunks.document_id,
        document_name: projectSpecDocuments.filename,
        page_start: projectSpecChunks.page_start,
        page_end: projectSpecChunks.page_end,
        section_number: projectSpecChunks.section_number,
        canonical_section_number: projectSpecChunks.canonical_section_number,
        section_title: projectSpecChunks.section_title,
        content: projectSpecChunks.content,
        rank: sql<number>`10`,
        method: sql<string>`'section'`,
      })
      .from(projectSpecChunks)
      .innerJoin(projectSpecDocuments, eq(projectSpecChunks.document_id, projectSpecDocuments.id))
      .where(and(
        eq(projectSpecChunks.project_id, projectId),
        eq(projectSpecChunks.chunk_type, 'child'),
        inArray(projectSpecChunks.canonical_section_number, sections),
      ))
      .orderBy(projectSpecChunks.page_start, projectSpecChunks.chunk_index)
      .limit(limit)

    if (sectionRows.length > 0) diagnostics.methods?.push('section')
    for (const row of sectionRows) {
      const chunk = rowToRetrievedSpecChunk(row)
      results.set(row.id, chunk)
      diagnostics.candidates?.push(candidateDiagnostic(chunk, 'section'))
    }
  }

  if (results.size < limit) {
    try {
      const embedding = await generateEmbedding(expanded)
      if (embedding) {
        const vectorLiteral = `[${embedding.join(',')}]`
        const rows = await db
          .select({
            id: projectSpecChunks.id,
            document_id: projectSpecChunks.document_id,
            document_name: projectSpecDocuments.filename,
            page_start: projectSpecChunks.page_start,
            page_end: projectSpecChunks.page_end,
            section_number: projectSpecChunks.section_number,
            canonical_section_number: projectSpecChunks.canonical_section_number,
            section_title: projectSpecChunks.section_title,
            content: projectSpecChunks.content,
            rank: sql<number>`1 - (${projectSpecChunks.embedding} <=> ${vectorLiteral}::vector)`,
            method: sql<string>`'semantic'`,
          })
          .from(projectSpecChunks)
          .innerJoin(projectSpecDocuments, eq(projectSpecChunks.document_id, projectSpecDocuments.id))
          .where(and(
            eq(projectSpecChunks.project_id, projectId),
            eq(projectSpecChunks.chunk_type, 'child'),
            sql`${projectSpecChunks.embedding} is not null`,
          ))
          .orderBy(sql`${projectSpecChunks.embedding} <=> ${vectorLiteral}::vector`)
          .limit(limit * 5)

        if (rows.length > 0) diagnostics.methods?.push('semantic')
        for (const row of rows) {
          const chunk = rowToRetrievedSpecChunk(row)
          results.set(row.id, chunk)
          diagnostics.candidates?.push(candidateDiagnostic(chunk, 'semantic'))
        }
      } else {
        diagnostics.errors?.push('Semantic retrieval skipped because no embedding provider is configured or chunk embeddings are missing.')
      }
    } catch (error) {
      diagnostics.errors?.push(error instanceof Error ? error.message : 'Semantic retrieval failed.')
    }
  }

  const keywordQuery = tsQueryFromKeywords(expanded)
  if (keywordQuery) {
    const tsQuery = sql`to_tsquery('english', ${keywordQuery})`
    const rows = await db
      .select({
        id: projectSpecChunks.id,
        document_id: projectSpecChunks.document_id,
        document_name: projectSpecDocuments.filename,
        page_start: projectSpecChunks.page_start,
        page_end: projectSpecChunks.page_end,
        section_number: projectSpecChunks.section_number,
        canonical_section_number: projectSpecChunks.canonical_section_number,
        section_title: projectSpecChunks.section_title,
        content: projectSpecChunks.content,
        rank: sql<number>`ts_rank(${vector}, ${tsQuery})`,
        method: sql<string>`'fts'`,
      })
      .from(projectSpecChunks)
      .innerJoin(projectSpecDocuments, eq(projectSpecChunks.document_id, projectSpecDocuments.id))
      .where(and(
        eq(projectSpecChunks.project_id, projectId),
        eq(projectSpecChunks.chunk_type, 'child'),
        sql`${vector} @@ ${tsQuery}`,
      ))
      .orderBy(sql`ts_rank(${vector}, ${tsQuery}) desc`)
      .limit(limit * 5)

    if (rows.length > 0) diagnostics.methods?.push('fts')
    for (const row of rows) {
      const chunk = rowToRetrievedSpecChunk(row)
      results.set(row.id, chunk)
      diagnostics.candidates?.push(candidateDiagnostic(chunk, 'fts'))
    }
  }

  if (results.size > 0) {
    const ranked = rankedRelevantChunks([...results.values()], expanded, sections, limit)
    if (ranked.length > 0) {
      const finalResults = new Map(ranked.map((chunk) => [chunk.id, chunk]))
      await addAdjacentSectionChunks(projectId, ranked, finalResults, limit)
      return { chunks: [...finalResults.values()].slice(0, limit), diagnostics }
    }
    diagnostics.errors?.push(`Filtered ${results.size} retrieval candidate(s) because they did not match the RFQ item topic.`)
  }

  const looseTerms = (expanded.toLowerCase().match(/[a-z][a-z0-9]{4,}/g) ?? [])
    .filter((term) => !STOP_WORDS.has(term))
    .slice(0, 6)
  if (looseTerms.length === 0) return { chunks: [], diagnostics }
  const looseConditions = looseTerms.map((term) => sql`${projectSpecChunks.content} ilike ${`%${term}%`}`)

  const rows = await db
    .select({
      id: projectSpecChunks.id,
      document_id: projectSpecChunks.document_id,
      document_name: projectSpecDocuments.filename,
      page_start: projectSpecChunks.page_start,
      page_end: projectSpecChunks.page_end,
      section_number: projectSpecChunks.section_number,
      canonical_section_number: projectSpecChunks.canonical_section_number,
      section_title: projectSpecChunks.section_title,
      content: projectSpecChunks.content,
      rank: sql<number>`0`,
      method: sql<string>`'loose'`,
    })
    .from(projectSpecChunks)
    .innerJoin(projectSpecDocuments, eq(projectSpecChunks.document_id, projectSpecDocuments.id))
    .where(and(
      eq(projectSpecChunks.project_id, projectId),
      eq(projectSpecChunks.chunk_type, 'child'),
      sql`(${sql.join(looseConditions, sql` or `)})`,
    ))
    .orderBy(projectSpecChunks.page_start)
    .limit(limit)

  if (rows.length > 0) diagnostics.methods?.push('loose')
  for (const row of rows) {
    const chunk = rowToRetrievedSpecChunk(row)
    results.set(row.id, chunk)
    diagnostics.candidates?.push(candidateDiagnostic(chunk, 'loose'))
  }
  const ranked = rankedRelevantChunks([...results.values()], expanded, sections, limit)
  if (ranked.length === 0) {
    if (rows.length > 0) diagnostics.errors?.push(`Filtered ${rows.length} loose retrieval candidate(s) because they did not match the RFQ item topic.`)
    return { chunks: [], diagnostics }
  }
  const finalResults = new Map(ranked.map((chunk) => [chunk.id, chunk]))
  await addAdjacentSectionChunks(projectId, ranked, finalResults, limit)
  return { chunks: [...finalResults.values()].slice(0, limit), diagnostics }
}

export async function retrieveSpecChunks(projectId: string, query: string, limit = 5): Promise<RetrievedSpecChunk[]> {
  return (await retrieveSpecChunksDetailed(projectId, query, limit)).chunks
}

export async function getBidSpecComplianceReport(bidId: string): Promise<BidSpecComplianceReport | undefined> {
  const row = (await db
    .select()
    .from(bidSpecComplianceReports)
    .where(eq(bidSpecComplianceReports.bid_id, bidId)))[0]
  return row ? reportWithItems(row) : undefined
}

export async function saveNoSpecsComplianceReport(input: {
  bidId: string
  rfqId: string
  projectId: string
}): Promise<BidSpecComplianceReport> {
  return saveComplianceReport({
    ...input,
    status: 'no_specs_available',
    summaryStatus: 'no_specs_available',
    model: undefined,
    error: undefined,
    items: [],
  })
}

export async function saveComplianceReport(input: {
  bidId: string
  rfqId: string
  projectId: string
  status: BidSpecComplianceReport['status']
  summaryStatus: BidSpecComplianceSummaryStatus
  model?: string
  error?: string
  items: Array<ComplianceEvaluationResult & { rfq_line_item_id?: string }>
}): Promise<BidSpecComplianceReport> {
  const now = new Date().toISOString()
  const highSeverityCount = input.items.filter((item) => item.status === 'violation' && item.severity === 'high').length
  const reportRow = (await db
    .insert(bidSpecComplianceReports)
    .values({
      bid_id: input.bidId,
      rfq_id: input.rfqId,
      project_id: input.projectId,
      status: input.status,
      summary_status: input.summaryStatus,
      high_severity_count: highSeverityCount,
      checked_at: now,
      model: input.model ?? null,
      error: input.error ?? null,
    })
    .onConflictDoUpdate({
      target: bidSpecComplianceReports.bid_id,
      set: {
        status: input.status,
        summary_status: input.summaryStatus,
        high_severity_count: highSeverityCount,
        checked_at: now,
        model: input.model ?? null,
        error: input.error ?? null,
      },
    })
    .returning())[0]

  await db.delete(bidSpecComplianceItems).where(eq(bidSpecComplianceItems.report_id, reportRow.id))
  if (input.items.length > 0) {
    await db.insert(bidSpecComplianceItems).values(
      input.items.map((item) => ({
        report_id: reportRow.id,
        bid_id: input.bidId,
        rfq_line_item_id: item.rfq_line_item_id ?? null,
        status: item.status,
        severity: item.severity,
        requirement_summary: item.requirement_summary,
        vendor_summary: item.vendor_summary,
        explanation: item.explanation,
        suggested_follow_up: item.suggested_follow_up ?? null,
        evidence_json: JSON.stringify(item.evidence),
        retrieval_diagnostics_json: JSON.stringify(item.retrieval_diagnostics ?? {}),
        product_lookup_json: JSON.stringify(item.product_lookup ?? { status: 'skipped' }),
        created_at: now,
      })),
    )
  }

  return reportWithItems(reportRow)
}
