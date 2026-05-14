import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { comparisonSheetVersions, comparisonSheetViews } from '@/lib/db/schema'
import {
  buildComparisonSheetVersionSave,
  DEFAULT_COMPARISON_SHEET_VIEW,
  normalizeComparisonSheetView,
  type ComparisonSheetView,
  type WorkbookVersionMetadata,
  type WorkbookVersionSummary,
} from '@/lib/procurement/comparison-sheet-state'
import { comparisonSheetVersionSchemaStatements } from '@/lib/procurement/comparison-sheet-version-schema'

export interface ComparisonSheetViewRecord {
  view: ComparisonSheetView
  exists: boolean
  currentVersionId?: number
}

export interface SaveComparisonSheetViewResult {
  view: ComparisonSheetView
  currentVersionId?: number
  createdVersion?: WorkbookVersionSummary
  createdVersions?: WorkbookVersionSummary[]
}

export async function getComparisonSheetView(rfqId: string): Promise<ComparisonSheetView> {
  return (await getComparisonSheetViewRecord(rfqId)).view
}

let comparisonSheetVersionSchemaReady: Promise<void> | null = null

export async function ensureComparisonSheetVersionSchema(): Promise<void> {
  comparisonSheetVersionSchemaReady ??= (async () => {
    for (const statement of comparisonSheetVersionSchemaStatements()) {
      await db.execute(sql.raw(statement))
    }
  })()
  return comparisonSheetVersionSchemaReady
}

export async function getComparisonSheetViewRecord(rfqId: string): Promise<ComparisonSheetViewRecord> {
  await ensureComparisonSheetVersionSchema()
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
  await ensureComparisonSheetVersionSchema()
  const normalized = normalizeComparisonSheetView(view)
  const now = new Date().toISOString()
  const existing = await getComparisonSheetViewRecord(rfqId)
  const latestVersion = await getLatestComparisonSheetVersion(rfqId)
  const built = buildComparisonSheetVersionSave({
    previousView: existing.exists ? existing.view : DEFAULT_COMPARISON_SHEET_VIEW,
    nextView: normalized,
    latestVersionNumber: latestVersion?.versionNumber ?? 0,
    currentVersionId: existing.currentVersionId ?? latestVersion?.id,
    createdAt: now,
    metadata,
  })

  if (!built) {
    await saveComparisonSheetViewOnly(rfqId, normalized, now, existing.currentVersionId ?? latestVersion?.id)
    return {
      view: normalized,
      currentVersionId: existing.currentVersionId ?? latestVersion?.id,
    }
  }

  const insertedVersions: Array<{
    id: number
    version_number: number
    parent_version_id: number | null
    source: WorkbookVersionSummary['source']
    summary: string
    actor_user_id: string | null
    proposal_json: string | null
    created_at: string
  }> = []
  try {
    let parentVersionId: number | undefined
    for (const version of built.versions) {
      const inserted = (await db.insert(comparisonSheetVersions)
        .values({
          rfq_id: rfqId,
          version_number: version.versionNumber,
          parent_version_id: version.parentVersionId ?? parentVersionId,
          view_json: JSON.stringify(version.versionNumber === built.versions[0]?.versionNumber && built.versions.length > 1
            ? normalizeComparisonSheetView(existing.exists ? existing.view : DEFAULT_COMPARISON_SHEET_VIEW)
            : built.view),
          source: version.source,
          summary: version.summary,
          actor_user_id: version.actorUserId,
          proposal_json: version.proposalJson,
          created_at: version.createdAt,
        })
        .returning({
          id: comparisonSheetVersions.id,
          version_number: comparisonSheetVersions.version_number,
          parent_version_id: comparisonSheetVersions.parent_version_id,
          source: comparisonSheetVersions.source,
          summary: comparisonSheetVersions.summary,
          actor_user_id: comparisonSheetVersions.actor_user_id,
          proposal_json: comparisonSheetVersions.proposal_json,
          created_at: comparisonSheetVersions.created_at,
        }))[0]
      if (inserted) {
        insertedVersions.push(inserted)
        parentVersionId = inserted.id
      }
    }
  } catch (error) {
    if (!isMissingWorkbookVersionSchemaError(error)) throw error
  }

  const currentVersion = insertedVersions.at(-1)
  if (!currentVersion) {
    await saveLegacyComparisonSheetView(rfqId, normalized, now)
    return { view: normalized }
  }

  try {
    await db.insert(comparisonSheetViews)
      .values({
        rfq_id: rfqId,
        view_json: JSON.stringify(normalized),
        current_version_id: currentVersion.id,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: comparisonSheetViews.rfq_id,
        set: {
          view_json: JSON.stringify(normalized),
          current_version_id: currentVersion.id,
          updated_at: now,
        },
      })
  } catch (error) {
    if (!isMissingWorkbookVersionSchemaError(error)) throw error
    await saveLegacyComparisonSheetView(rfqId, normalized, now)
    return {
      view: normalized,
      createdVersion: versionSummaryFromRow(currentVersion),
      createdVersions: insertedVersions.map(versionSummaryFromRow),
    }
  }
  return {
    view: normalized,
    currentVersionId: currentVersion.id,
    createdVersion: versionSummaryFromRow(currentVersion),
    createdVersions: insertedVersions.map(versionSummaryFromRow),
  }
}

export async function getComparisonSheetVersionHistory(rfqId: string, limit = 25): Promise<WorkbookVersionSummary[]> {
  await ensureComparisonSheetVersionSchema()
  try {
    const rows = await db
      .select({
        id: comparisonSheetVersions.id,
        version_number: comparisonSheetVersions.version_number,
        parent_version_id: comparisonSheetVersions.parent_version_id,
        source: comparisonSheetVersions.source,
        summary: comparisonSheetVersions.summary,
        actor_user_id: comparisonSheetVersions.actor_user_id,
        proposal_json: comparisonSheetVersions.proposal_json,
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
  await ensureComparisonSheetVersionSchema()
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
    proposal: metadata.proposal ?? { restoredVersionId: versionId, restoredVersionNumber: row.version_number, restoreKind: metadata.restoreKind ?? 'history' },
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

async function saveComparisonSheetViewOnly(
  rfqId: string,
  view: ComparisonSheetView,
  now: string,
  currentVersionId?: number,
) {
  try {
    await db.insert(comparisonSheetViews)
      .values({
        rfq_id: rfqId,
        view_json: JSON.stringify(view),
        current_version_id: currentVersionId ?? null,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: comparisonSheetViews.rfq_id,
        set: {
          view_json: JSON.stringify(view),
          current_version_id: currentVersionId ?? null,
          updated_at: now,
        },
      })
  } catch (error) {
    if (!isMissingWorkbookVersionSchemaError(error)) throw error
    await saveLegacyComparisonSheetView(rfqId, view, now)
  }
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
  await ensureComparisonSheetVersionSchema()
  try {
    const row = (await db
      .select({
        id: comparisonSheetVersions.id,
        version_number: comparisonSheetVersions.version_number,
        parent_version_id: comparisonSheetVersions.parent_version_id,
        source: comparisonSheetVersions.source,
        summary: comparisonSheetVersions.summary,
        actor_user_id: comparisonSheetVersions.actor_user_id,
        proposal_json: comparisonSheetVersions.proposal_json,
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
  proposal_json?: string | null
  created_at: string
}): WorkbookVersionSummary {
  return {
    id: row.id,
    versionNumber: row.version_number,
    parentVersionId: row.parent_version_id ?? undefined,
    source: row.source,
    summary: row.summary,
    actorUserId: row.actor_user_id ?? undefined,
    restoredVersionId: restoredVersionIdFromProposal(row.proposal_json),
    restoreKind: restoreKindFromProposal(row.proposal_json),
    createdAt: row.created_at,
  }
}

function restoredVersionIdFromProposal(proposalJson: string | null | undefined) {
  if (!proposalJson) return undefined
  try {
    const proposal = JSON.parse(proposalJson) as { restoredVersionId?: unknown }
    return typeof proposal.restoredVersionId === 'number' ? proposal.restoredVersionId : undefined
  } catch {
    return undefined
  }
}

function restoreKindFromProposal(proposalJson: string | null | undefined) {
  if (!proposalJson) return undefined
  try {
    const proposal = JSON.parse(proposalJson) as { restoreKind?: unknown }
    return proposal.restoreKind === 'undo' || proposal.restoreKind === 'redo' || proposal.restoreKind === 'history'
      ? proposal.restoreKind
      : undefined
  } catch {
    return undefined
  }
}
