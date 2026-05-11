import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { proposeComparisonCommandFallback } from '@/lib/procurement/comparison-command-fallback'

const RIALTO_AGENT_API_URL = process.env.RIALTO_AGENT_API_URL ?? 'http://localhost:8787'

interface SchemaColumn {
  key: string
  label: string
  kind: 'rfq-core' | 'rfq-attribute' | 'rfq-standard' | 'vendor' | 'derived' | 'manual'
  vendorId?: string
  vendorName?: string
  metric?: 'unit_price' | 'total' | 'lead'
  isEmpty?: boolean
}

interface SchemaItem {
  id: string
  description: string
}

interface SchemaVendor {
  id: string
  name: string
}

interface RequestBody {
  message?: string
  currentView?: unknown
  sheetSchema?: {
    columns?: SchemaColumn[]
    lineItems?: SchemaItem[]
    vendors?: SchemaVendor[]
  }
}

interface PatchHighlight {
  id: string
  selector:
    | { kind: 'cell'; rowKey: string; colKey: string }
    | { kind: 'rule'; rule: 'fastest-lead-per-row' | 'lowest-price-per-row' | 'highest-coverage-overall' }
  color: string
  note?: string
}

interface PatchDerivedColumn {
  key: string
  label: string
  formula: string
  insertAfterColKey?: string
}

interface PatchManualColumn {
  key: string
  label: string
  insertAfterColKey?: string
}

interface PatchManualLineItem {
  id: string
  sku: string
  description: string
  quantity: number
  unit: string
  insertAfterLineItemId?: string
}

interface ComparisonViewPatch {
  summary: string
  hideColumnKeys?: string[]
  showColumnKeys?: string[]
  hideLineItemIds?: string[]
  showLineItemIds?: string[]
  addHighlights?: PatchHighlight[]
  removeHighlightIds?: string[]
  clearHighlights?: boolean
  addDerivedColumns?: PatchDerivedColumn[]
  removeDerivedColumnKeys?: string[]
  addManualColumns?: PatchManualColumn[]
  addManualLineItems?: PatchManualLineItem[]
  setCells?: Array<{ rowKey: string; colKey: string; value: string }>
  setColumnLabels?: Array<{ colKey: string; label: string }>
  setLineItemOrder?: string[]
}

interface RawAIResponse {
  summary?: string
  hideColumnKeys?: string[]
  showColumnKeys?: string[]
  hideLineItemIds?: string[]
  showLineItemIds?: string[]
  addHighlights?: Array<{
    id?: string
    selector?: PatchHighlight['selector']
    color?: string
    note?: string
  }>
  removeHighlightIds?: string[]
  clearHighlights?: boolean
  addDerivedColumns?: Array<Partial<PatchDerivedColumn>>
  removeDerivedColumnKeys?: string[]
  addManualColumns?: Array<Partial<PatchManualColumn>>
  addManualLineItems?: Array<Partial<PatchManualLineItem>>
  setCells?: Array<{ rowKey?: unknown; colKey?: unknown; value?: unknown }>
  setColumnLabels?: Array<{ colKey?: unknown; label?: unknown }>
  setLineItemOrder?: unknown[]
}

function isCorePinned(key: string) {
  return key === '__item' || key === '__desc' || key === '__qty_unit'
}

const HL_PALETTE = {
  yellow: '#fef3c7',
  green: '#bbf7d0',
  red: '#fecaca',
  sky: '#bae6fd',
  violet: '#e9d5ff',
}

function pickColor(message: string): string {
  const m = message.toLowerCase()
  if (/(green|good|best|fastest|lowest|cheapest)/.test(m)) return HL_PALETTE.green
  if (/(red|bad|slowest|worst|highest|expensive)/.test(m)) return HL_PALETTE.red
  if (/(blue|sky)/.test(m)) return HL_PALETTE.sky
  if (/(violet|purple)/.test(m)) return HL_PALETTE.violet
  return HL_PALETTE.yellow
}

function findColumnsByPhrase(cols: SchemaColumn[], phrase: string): SchemaColumn[] {
  const target = phrase.trim().toLowerCase()
  if (!target) return []
  // Exact label match first
  const exact = cols.filter((c) => c.label.toLowerCase() === target)
  if (exact.length) return exact
  // Substring on label
  const labelMatch = cols.filter((c) => c.label.toLowerCase().includes(target))
  if (labelMatch.length) return labelMatch
  // Substring on key (e.g. "specs", "qty")
  return cols.filter((c) => c.key.toLowerCase().includes(target))
}

function findItemsByPhrase(items: SchemaItem[], phrase: string): SchemaItem[] {
  const target = phrase.trim().toLowerCase()
  if (!target) return []
  return items.filter((i) => i.description.toLowerCase().includes(target))
}

function highlightCellsForRow(item: SchemaItem, cols: SchemaColumn[], color: string): RawAIResponse['addHighlights'] {
  const ts = Date.now()
  return cols
    .filter((c) => !isCorePinned(c.key))
    .map((c, i) => ({
      id: `hl-row-${item.id}-${ts}-${i}`,
      selector: { kind: 'cell' as const, rowKey: item.id, colKey: c.key },
      color,
    }))
}

function highlightCellsForColumn(col: SchemaColumn, items: SchemaItem[], color: string): RawAIResponse['addHighlights'] {
  const ts = Date.now()
  return items.map((i, idx) => ({
    id: `hl-col-${col.key}-${ts}-${idx}`,
    selector: { kind: 'cell' as const, rowKey: i.id, colKey: col.key },
    color,
  }))
}

function fallbackPatch(message: string, schema: RequestBody['sheetSchema']): RawAIResponse {
  const lower = message.toLowerCase().trim()
  const cols = schema?.columns ?? []
  const items = schema?.lineItems ?? []
  const color = pickColor(message)
  const commandPatch = proposeComparisonCommandFallback(message, { columns: cols })
  if (commandPatch) return commandPatch

  // 1) Clear/reset highlights
  if (/\b(clear|reset|remove all)\b.*(highlight|color|colour)/.test(lower)) {
    return { summary: 'Cleared all highlights.', clearHighlights: true }
  }

  // 2) Conditional highlight rules
  if (/\b(highlight|mark|color|colour|flag)\b[^.]*\b(fastest|quickest|shortest|earliest)\b[^.]*(lead|delivery|ship)/.test(lower)
      || (/\b(fastest|quickest|shortest)\b/.test(lower) && /\b(lead|delivery)/.test(lower))) {
    return {
      summary: 'Highlighted the vendor with the fastest lead time on each row.',
      addHighlights: [{ id: `hl-fastest-lead-${Date.now()}`, selector: { kind: 'rule', rule: 'fastest-lead-per-row' }, color: HL_PALETTE.green }],
    }
  }
  if (/\b(highlight|mark|color|colour|flag)\b[^.]*\b(lowest|cheapest|best|min(?:imum)?)\b[^.]*(price|cost|bid|total)/.test(lower)
      || /\b(lowest|cheapest)\b\s+(price|bid|cost|total)/.test(lower)) {
    return {
      summary: 'Highlighted the lowest total per row.',
      addHighlights: [{ id: `hl-lowest-price-${Date.now()}`, selector: { kind: 'rule', rule: 'lowest-price-per-row' }, color: HL_PALETTE.green }],
    }
  }

  // 3) Hide all empty columns
  if (/\b(hide|remove|drop|clean(?:up)?)\b[^.]*\b(empty|blank|unused|no data)\b[^.]*\bcol/.test(lower)
      || /\bhide\s+(all\s+)?(the\s+)?empty\b/.test(lower)) {
    const empties = cols.filter((c) => c.isEmpty && !isCorePinned(c.key))
    if (empties.length === 0) {
      return { summary: 'No empty columns to hide.' }
    }
    return {
      summary: `Hid ${empties.length} empty column${empties.length === 1 ? '' : 's'}.`,
      hideColumnKeys: empties.map((c) => c.key),
    }
  }

  // 4) Show all hidden / unhide all
  if (/\b(show|unhide|restore|reveal)\b[^.]*\b(all|hidden|every)\b/.test(lower)) {
    return { summary: 'Restored all hidden columns.', showColumnKeys: cols.map((c) => c.key) }
  }

  // 5) Hide all vendor cells
  if (/\b(hide|remove|drop)\b[^.]*\b(all|every)\b[^.]*\b(vendor|bid|quote)/.test(lower)) {
    const vendorCols = cols.filter((c) => c.kind === 'vendor')
    if (vendorCols.length > 0) {
      return { summary: `Hid all ${vendorCols.length} vendor columns.`, hideColumnKeys: vendorCols.map((c) => c.key) }
    }
  }

  // 6) Highlight the X row / "highlight the row containing X"
  const highlightRowMatch = lower.match(/\b(highlight|mark|color|colour|flag)\s+(?:the\s+)?(?:row\s+(?:for\s+|containing\s+|with\s+)?)?(.+?)\s+row\b/)
    ?? lower.match(/\b(highlight|mark|color|colour|flag)\s+(?:the\s+)?row\s+(?:for\s+|containing\s+|with\s+)?(.+?)\s*$/)
    ?? lower.match(/\b(highlight|mark|color|colour|flag)\s+(?:the\s+)?(.+?)\s+line\s*item\s*$/)
  if (highlightRowMatch) {
    const target = highlightRowMatch[2].trim()
    const matched = findItemsByPhrase(items, target)
    if (matched.length > 0) {
      const all: NonNullable<RawAIResponse['addHighlights']> = []
      for (const item of matched) {
        const cells = highlightCellsForRow(item, cols, color)
        if (cells) all.push(...cells)
      }
      return {
        summary: `Highlighted ${matched.length} row${matched.length === 1 ? '' : 's'} matching "${target}".`,
        addHighlights: all,
      }
    }
  }

  // 7) Highlight the X column
  const highlightColMatch = lower.match(/\b(highlight|mark|color|colour|flag)\s+(?:the\s+)?(.+?)\s+column(?:s)?\b/)
    ?? lower.match(/\b(highlight|mark|color|colour|flag)\s+column(?:s)?\s+(.+?)\s*$/)
  if (highlightColMatch) {
    const target = highlightColMatch[2].trim()
    const matched = findColumnsByPhrase(cols, target)
    if (matched.length > 0) {
      const all: NonNullable<RawAIResponse['addHighlights']> = []
      for (const col of matched) {
        const cells = highlightCellsForColumn(col, items, color)
        if (cells) all.push(...cells)
      }
      return {
        summary: `Highlighted ${matched.length} column${matched.length === 1 ? '' : 's'} matching "${target}".`,
        addHighlights: all,
      }
    }
  }

  // 8) Show / unhide a specific column
  const showMatch = lower.match(/\b(show|unhide|restore|reveal|bring back|put back)\s+(?:the\s+)?(.+?)\s*(?:column|columns)?\s*$/)
  if (showMatch) {
    const target = showMatch[2].trim()
    const matches = findColumnsByPhrase(cols, target)
    if (matches.length > 0) {
      return {
        summary: `Restored ${matches.length} column${matches.length === 1 ? '' : 's'} matching "${target}".`,
        showColumnKeys: matches.map((m) => m.key),
      }
    }
  }

  // 9) Hide a specific column (or all columns matching a label substring)
  const hideMatch = lower.match(/\b(hide|remove|delete|drop)\s+(?:the\s+)?(.+?)\s*(?:column|columns)?\s*$/)
  if (hideMatch) {
    const target = hideMatch[2].trim()
    const matches = findColumnsByPhrase(cols, target).filter((c) => !isCorePinned(c.key))
    if (matches.length > 0) {
      return {
        summary: `Hid ${matches.length} column${matches.length === 1 ? '' : 's'} matching "${target}".`,
        hideColumnKeys: matches.map((m) => m.key),
      }
    }
  }

  // 10) Hide a specific line item
  const hideRowMatch = lower.match(/\b(hide|remove|drop)\s+(?:the\s+)?(?:row|item|line item)\s+(.+)$/)
  if (hideRowMatch) {
    const target = hideRowMatch[2].trim()
    const matches = findItemsByPhrase(items, target)
    if (matches.length > 0) {
      return { summary: `Hid ${matches.length} row${matches.length === 1 ? '' : 's'}.`, hideLineItemIds: matches.map((m) => m.id) }
    }
  }

  return {
    summary: 'I didn’t catch that. Try: "highlight the ready-mix concrete row", "highlight the unit price column", "hide all empty columns", "highlight the lowest price", or "hide a vendor column".',
  }
}

function normalizePatch(raw: RawAIResponse): ComparisonViewPatch {
  const patch: ComparisonViewPatch = {
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : 'Applied change.',
  }
  if (Array.isArray(raw.hideColumnKeys) && raw.hideColumnKeys.length) patch.hideColumnKeys = raw.hideColumnKeys.filter((k) => typeof k === 'string')
  if (Array.isArray(raw.showColumnKeys) && raw.showColumnKeys.length) patch.showColumnKeys = raw.showColumnKeys.filter((k) => typeof k === 'string')
  if (Array.isArray(raw.hideLineItemIds) && raw.hideLineItemIds.length) patch.hideLineItemIds = raw.hideLineItemIds.filter((k) => typeof k === 'string')
  if (Array.isArray(raw.showLineItemIds) && raw.showLineItemIds.length) patch.showLineItemIds = raw.showLineItemIds.filter((k) => typeof k === 'string')
  if (raw.clearHighlights) patch.clearHighlights = true
  if (Array.isArray(raw.removeHighlightIds) && raw.removeHighlightIds.length) patch.removeHighlightIds = raw.removeHighlightIds.filter((k) => typeof k === 'string')
  if (Array.isArray(raw.addHighlights) && raw.addHighlights.length) {
    patch.addHighlights = raw.addHighlights
      .filter((h): h is { id?: string; selector: PatchHighlight['selector']; color?: string; note?: string } => Boolean(h?.selector))
      .map((h, i) => ({
        id: typeof h.id === 'string' && h.id ? h.id : `hl-${Date.now()}-${i}`,
        selector: h.selector,
        color: typeof h.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(h.color) ? h.color : '#fef3c7',
        note: typeof h.note === 'string' ? h.note : undefined,
      }))
  }
  if (Array.isArray(raw.addDerivedColumns) && raw.addDerivedColumns.length) {
    patch.addDerivedColumns = raw.addDerivedColumns
      .filter((c): c is Partial<PatchDerivedColumn> => Boolean(c?.key && c?.label && c?.formula))
      .map((c) => ({
        key: String(c.key),
        label: String(c.label),
        formula: String(c.formula),
        insertAfterColKey: typeof c.insertAfterColKey === 'string' ? c.insertAfterColKey : undefined,
      }))
  }
  if (Array.isArray(raw.removeDerivedColumnKeys) && raw.removeDerivedColumnKeys.length) {
    patch.removeDerivedColumnKeys = raw.removeDerivedColumnKeys.filter((k) => typeof k === 'string')
  }
  if (Array.isArray(raw.addManualColumns) && raw.addManualColumns.length) {
    patch.addManualColumns = raw.addManualColumns
      .filter((c): c is Partial<PatchManualColumn> => Boolean(c?.key && c?.label))
      .map((c) => ({
        key: String(c.key),
        label: String(c.label),
        insertAfterColKey: typeof c.insertAfterColKey === 'string' ? c.insertAfterColKey : undefined,
      }))
  }
  if (Array.isArray(raw.addManualLineItems) && raw.addManualLineItems.length) {
    patch.addManualLineItems = raw.addManualLineItems
      .filter((r): r is Partial<PatchManualLineItem> => Boolean(r?.id))
      .map((r) => ({
        id: String(r.id),
        sku: typeof r.sku === 'string' ? r.sku : '',
        description: typeof r.description === 'string' ? r.description : '',
        quantity: typeof r.quantity === 'number' ? r.quantity : 0,
        unit: typeof r.unit === 'string' ? r.unit : '',
        insertAfterLineItemId: typeof r.insertAfterLineItemId === 'string' ? r.insertAfterLineItemId : undefined,
      }))
  }
  if (Array.isArray(raw.setCells) && raw.setCells.length) {
    patch.setCells = raw.setCells
      .filter((cell): cell is { rowKey: string; colKey: string; value?: unknown } => typeof cell?.rowKey === 'string' && typeof cell?.colKey === 'string')
      .map((cell) => ({ rowKey: cell.rowKey, colKey: cell.colKey, value: cell.value == null ? '' : String(cell.value) }))
  }
  if (Array.isArray(raw.setColumnLabels) && raw.setColumnLabels.length) {
    patch.setColumnLabels = raw.setColumnLabels
      .filter((col): col is { colKey: string; label: string } => typeof col?.colKey === 'string' && typeof col?.label === 'string')
      .map((col) => ({ colKey: col.colKey, label: col.label }))
  }
  if (Array.isArray(raw.setLineItemOrder) && raw.setLineItemOrder.length) {
    patch.setLineItemOrder = raw.setLineItemOrder.filter((id): id is string => typeof id === 'string')
  }
  return patch
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const message = (body.message ?? '').trim()
  if (!message) return NextResponse.json({ error: 'message is required.' }, { status: 400 })

  try {
    const response = await fetch(`${RIALTO_AGENT_API_URL}/comparison/propose-patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        currentView: body.currentView,
        sheetSchema: body.sheetSchema,
      }),
    })
    const data = await response.json() as { patch?: ComparisonViewPatch; error?: string; usedFallback?: boolean }
    if (!response.ok || !data.patch) throw new Error(data.error ?? 'Comparison patch backend failed.')
    return NextResponse.json({ patch: data.patch, usedFallback: Boolean(data.usedFallback) })
  } catch (error) {
    console.error('bid-comparison ai-propose failed:', error instanceof Error ? error.message : error)
    const patch = normalizePatch(fallbackPatch(message, body.sheetSchema))
    return NextResponse.json({ patch, usedFallback: true })
  }
}
