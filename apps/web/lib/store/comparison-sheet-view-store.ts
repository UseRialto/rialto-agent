import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { comparisonSheetVersions, comparisonSheetViews } from '@/lib/db/schema'
import {
  buildComparisonSheetVersion,
  DEFAULT_COMPARISON_SHEET_VIEW,
  normalizeComparisonSheetView,
  type ComparisonSheetView,
  type WorkbookVersionMetadata,
  type WorkbookVersionSummary,
} from '@/lib/procurement/comparison-sheet-state'

export interface ComparisonSheetViewRecord {
  view: ComparisonSheetView
  exists: boolean
  currentVersionId?: number
}

export interface SaveComparisonSheetViewResult {
  view: ComparisonSheetView
  currentVersionId?: number
  createdVersion?: WorkbookVersionSummary
}

export async function getComparisonSheetView(rfqId: string): Promise<ComparisonSheetView> {
  return (await getComparisonSheetViewRecord(rfqId)).view
}

export async function getComparisonSheetViewRecord(rfqId: string): Promise<ComparisonSheetViewRecord> {
  let row: { view_json: string; current_version_id?: number | null } | undefined
  try {
    row = (await db
      .select({
        view_json: comparisonSheetViews.view_json,
        current_version_id: comparisonSheetViews.current_version_id,
      })
      .from(comparisonSheetViews)
      .where(eq(comparisonSheetViews.rfq_id, rfqId)))[0]
  } catch (error) {
    if (!isMissingWorkbookVersionSchemaError(error)) throw error
    row = (await db
      .select({ view_json: comparisonSheetViews.view_json })
      .from(comparisonSheetViews)
      .where(eq(comparisonSheetViews.rfq_id, rfqId)))[0]
  }

  if (!row) return { view: DEFAULT_COMPARISON_SHEET_VIEW, exists: false }
  return {
    view: normalizeComparisonSheetView(JSON.parse(row.view_json)),
    exists: true,
    currentVersionId: row.current_version_id ?? undefined,
  }
}

export async function saveComparisonSheetView(
  rfqId: string,
  view: ComparisonSheetView,
  metadata: WorkbookVersionMetadata = {},
): Promise<SaveComparisonSheetViewResult> {
  const normalized = normalizeComparisonSheetView(view)
  const now = new Date().toISOString()
  const existing = await getComparisonSheetViewRecord(rfqId)
  const latestVersion = await getLatestComparisonSheetVersion(rfqId)
  const built = buildComparisonSheetVersion({
    previousView: existing.exists ? existing.view : DEFAULT_COMPARISON_SHEET_VIEW,
    nextView: normalized,
    latestVersionNumber: latestVersion?.versionNumber ?? 0,
    currentVersionId: existing.currentVersionId ?? latestVersion?.id,
    createdAt: now,
    metadata,
  })

  if (!built) {
    return {
      view: normalized,
      currentVersionId: existing.currentVersionId ?? latestVersion?.id,
    }
  }

  let inserted: {
    id: number
    version_number: number
    parent_version_id: number | null
    source: WorkbookVersionSummary['source']
    summary: string
    actor_user_id: string | null
    created_at: string
  } | undefined
  try {
    inserted = (await db.insert(comparisonSheetVersions)
      .values({
        rfq_id: rfqId,
        version_number: built.version.versionNumber,
        parent_version_id: built.version.parentVersionId,
        view_json: JSON.stringify(built.view),
        source: built.version.source,
        summary: built.version.summary,
        actor_user_id: built.version.actorUserId,
        proposal_json: built.version.proposalJson,
        created_at: built.version.createdAt,
      })
      .returning({
        id: comparisonSheetVersions.id,
        version_number: comparisonSheetVersions.version_number,
        parent_version_id: comparisonSheetVersions.parent_version_id,
        source: comparisonSheetVersions.source,
        summary: comparisonSheetVersions.summary,
        actor_user_id: comparisonSheetVersions.actor_user_id,
        created_at: comparisonSheetVersions.created_at,
      }))[0]
  } catch (error) {
    if (!isMissingWorkbookVersionSchemaError(error)) throw error
  }

  if (!inserted) {
    await saveLegacyComparisonSheetView(rfqId, normalized, now)
    return { view: normalized }
  }

  try {
    await db.insert(comparisonSheetViews)
      .values({
        rfq_id: rfqId,
        view_json: JSON.stringify(normalized),
        current_version_id: inserted.id,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: comparisonSheetViews.rfq_id,
        set: {
          view_json: JSON.stringify(normalized),
          current_version_id: inserted.id,
          updated_at: now,
        },
      })
  } catch (error) {
    if (!isMissingWorkbookVersionSchemaError(error)) throw error
    await saveLegacyComparisonSheetView(rfqId, normalized, now)
    return { view: normalized, createdVersion: versionSummaryFromRow(inserted) }
  }
  return {
    view: normalized,
    currentVersionId: inserted.id,
    createdVersion: versionSummaryFromRow(inserted),
  }
}

export async function getComparisonSheetVersionHistory(rfqId: string, limit = 25): Promise<WorkbookVersionSummary[]> {
  try {
    const rows = await db
      .select({
        id: comparisonSheetVersions.id,
        version_number: comparisonSheetVersions.version_number,
        parent_version_id: comparisonSheetVersions.parent_version_id,
        source: comparisonSheetVersions.source,
        summary: comparisonSheetVersions.summary,
        actor_user_id: comparisonSheetVersions.actor_user_id,
        created_at: comparisonSheetVersions.created_at,
      })
      .from(comparisonSheetVersions)
      .where(eq(comparisonSheetVersions.rfq_id, rfqId))
      .orderBy(desc(comparisonSheetVersions.version_number))
      .limit(limit)
    return rows.map(versionSummaryFromRow)
  } catch (error) {
    if (!isMissingWorkbookVersionSchemaError(error)) throw error
    return []
  }
}

export async function restoreComparisonSheetVersion(
  rfqId: string,
  versionId: number,
  metadata: Omit<WorkbookVersionMetadata, 'source'> = {},
): Promise<SaveComparisonSheetViewResult> {
  const row = (await db
    .select({ view_json: comparisonSheetVersions.view_json, version_number: comparisonSheetVersions.version_number })
    .from(comparisonSheetVersions)
    .where(and(
      eq(comparisonSheetVersions.id, versionId),
      eq(comparisonSheetVersions.rfq_id, rfqId),
    )))[0]
  if (!row) throw new Error('Comparison sheet version not found.')
  return saveComparisonSheetView(rfqId, normalizeComparisonSheetView(JSON.parse(row.view_json)), {
    ...metadata,
    source: 'restore',
    summary: metadata.summary ?? `Restored workbook version ${row.version_number}.`,
  })
}

async function saveLegacyComparisonSheetView(rfqId: string, view: ComparisonSheetView, now: string) {
  await db.execute(sql`
    insert into comparison_sheet_views (rfq_id, view_json, created_at, updated_at)
    values (${rfqId}, ${JSON.stringify(view)}, ${now}, ${now})
    on conflict (rfq_id) do update set
      view_json = ${JSON.stringify(view)},
      updated_at = ${now}
  `)
}

function isMissingWorkbookVersionSchemaError(error: unknown) {
  const text = error instanceof Error ? `${error.message} ${String((error as { cause?: unknown }).cause ?? '')}` : String(error)
  return text.includes('current_version_id')
    || text.includes('comparison_sheet_versions')
    || text.includes('does not exist')
    || text.includes('42703')
    || text.includes('42P01')
}

async function getLatestComparisonSheetVersion(rfqId: string): Promise<WorkbookVersionSummary | undefined> {
  try {
    const row = (await db
      .select({
        id: comparisonSheetVersions.id,
        version_number: comparisonSheetVersions.version_number,
        parent_version_id: comparisonSheetVersions.parent_version_id,
        source: comparisonSheetVersions.source,
        summary: comparisonSheetVersions.summary,
        actor_user_id: comparisonSheetVersions.actor_user_id,
        created_at: comparisonSheetVersions.created_at,
      })
      .from(comparisonSheetVersions)
      .where(eq(comparisonSheetVersions.rfq_id, rfqId))
      .orderBy(desc(comparisonSheetVersions.version_number))
      .limit(1))[0]
    return row ? versionSummaryFromRow(row) : undefined
  } catch (error) {
    if (!isMissingWorkbookVersionSchemaError(error)) throw error
    return undefined
  }
}

function versionSummaryFromRow(row: {
  id: number
  version_number: number
  parent_version_id: number | null
  source: WorkbookVersionSummary['source']
  summary: string
  actor_user_id: string | null
  created_at: string
}): WorkbookVersionSummary {
  return {
    id: row.id,
    versionNumber: row.version_number,
    parentVersionId: row.parent_version_id ?? undefined,
    source: row.source,
    summary: row.summary,
    actorUserId: row.actor_user_id ?? undefined,
    createdAt: row.created_at,
  }
}
