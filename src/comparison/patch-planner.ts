import { parseJson } from '../agent/llm.js'

export interface SchemaColumn {
  key: string
  label: string
  kind: 'rfq-core' | 'rfq-attribute' | 'rfq-standard' | 'vendor' | 'derived' | 'manual'
  vendorId?: string
  vendorName?: string
  metric?: 'unit_price' | 'total' | 'lead' | 'alternate' | 'response_attr'
  isEmpty?: boolean
}

export interface SchemaItem {
  id: string
  description: string
}

export interface SchemaVendor {
  id: string
  name: string
}

export interface ComparisonPatchRequest {
  message: string
  currentView?: unknown
  sheetSchema?: {
    columns?: SchemaColumn[]
    lineItems?: SchemaItem[]
    vendors?: SchemaVendor[]
  }
}

export interface ComparisonViewPatch {
  summary: string
  deleteColumnKeys?: string[]
  hideColumnKeys?: string[]
  showColumnKeys?: string[]
  deleteLineItemIds?: string[]
  hideLineItemIds?: string[]
  showLineItemIds?: string[]
  addHighlights?: Array<{
    id: string
    selector:
      | { kind: 'cell'; rowKey: string; colKey: string }
      | { kind: 'rule'; rule: 'fastest-lead-per-row' | 'lowest-price-per-row' | 'highest-coverage-overall' }
    color: string
    note?: string
  }>
  removeHighlightIds?: string[]
  clearHighlights?: boolean
  addDerivedColumns?: Array<{
    key: string
    label: string
    formula: string
    insertAfterColKey?: string
  }>
  removeDerivedColumnKeys?: string[]
  addManualColumns?: Array<{
    key: string
    label: string
    insertAfterColKey?: string
  }>
  addManualLineItems?: Array<{
    id: string
    sku: string
    description: string
    quantity: number
    unit: string
    insertAfterLineItemId?: string
  }>
  setCells?: Array<{ rowKey: string; colKey: string; value: string }>
  setColumnLabels?: Array<{ colKey: string; label: string }>
  setLineItemOrder?: string[]
  sortRowsByColumn?: { colKey: string; direction: 'asc' | 'desc' }
  filterBlankRowsByColumnKey?: string
}

const HL_PALETTE = {
  yellow: '#fef3c7',
  green: '#bbf7d0',
  red: '#fecaca',
  sky: '#bae6fd',
  violet: '#e9d5ff',
}

function isCorePinned(key: string) {
  return key === '__item' || key === '__desc' || key === '__qty_unit'
}

function pickColor(message: string): string {
  const m = message.toLowerCase()
  if (/(green|good|best|fastest|lowest|cheapest)/.test(m)) return HL_PALETTE.green
  if (/(red|bad|slowest|worst|highest|expensive|risk|problem|issue)/.test(m)) return HL_PALETTE.red
  if (/(blue|update|newer|vendor update)/.test(m)) return HL_PALETTE.sky
  if (/(violet|purple|alternate|scope)/.test(m)) return HL_PALETTE.violet
  return HL_PALETTE.yellow
}

function findColumnsByPhrase(cols: SchemaColumn[], phrase: string): SchemaColumn[] {
  const target = phrase.trim().toLowerCase()
  if (!target) return []
  const exact = cols.filter((c) => c.label.toLowerCase() === target)
  if (exact.length) return exact
  const labelMatch = cols.filter((c) => c.label.toLowerCase().includes(target))
  if (labelMatch.length) return labelMatch
  const vendorMatch = cols.filter((c) => c.vendorName?.toLowerCase().includes(target))
  if (vendorMatch.length) return vendorMatch
  return cols.filter((c) => c.key.toLowerCase().includes(target))
}

function findItemsByPhrase(items: SchemaItem[], phrase: string): SchemaItem[] {
  const target = phrase.trim().toLowerCase()
  if (!target) return []
  return items.filter((i) => i.description.toLowerCase().includes(target))
}

function editDistanceAtMostOne(a: string, b: string) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let edits = 0
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1
      j += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
      i += 2
      j += 2
    } else if (a.length > b.length) i += 1
    else if (b.length > a.length) j += 1
    else {
      i += 1
      j += 1
    }
  }
  if (i < a.length || j < b.length) edits += 1
  return edits <= 1
}

function normalizeCommandWords(message: string) {
  const commandWords = [
    'delete', 'remove', 'hide', 'drop', 'show', 'unhide', 'restore', 'reveal',
    'column', 'columns', 'row', 'rows', 'cell', 'insert', 'add', 'create',
    'rename', 'sort', 'filter', 'blank', 'blanks', 'clear', 'set',
  ]
  return message.replace(/\b[a-z]{3,}\b/gi, (word) => {
    const lower = word.toLowerCase()
    const replacement = commandWords.find((candidate) => editDistanceAtMostOne(lower, candidate))
    return replacement ?? word
  })
}

function stableKey(label: string, prefix: string) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${prefix}-${slug || 'new'}-${Date.now()}`
}

function columnBefore(cols: SchemaColumn[], key: string | undefined) {
  if (!key) return undefined
  const index = cols.findIndex((col) => col.key === key)
  if (index <= 0) return '__before_first__'
  return cols[index - 1]?.key
}

function normalizePatch(raw: Partial<ComparisonViewPatch> | null | undefined): ComparisonViewPatch {
  const patch: ComparisonViewPatch = {
    summary: typeof raw?.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : 'Prepared a comparison-sheet preview.',
  }
  if (Array.isArray(raw?.deleteColumnKeys)) patch.deleteColumnKeys = raw.deleteColumnKeys.filter((k) => typeof k === 'string')
  if (Array.isArray(raw?.hideColumnKeys)) patch.hideColumnKeys = raw.hideColumnKeys.filter((k) => typeof k === 'string')
  if (Array.isArray(raw?.showColumnKeys)) patch.showColumnKeys = raw.showColumnKeys.filter((k) => typeof k === 'string')
  if (Array.isArray(raw?.deleteLineItemIds)) patch.deleteLineItemIds = raw.deleteLineItemIds.filter((k) => typeof k === 'string')
  if (Array.isArray(raw?.hideLineItemIds)) patch.hideLineItemIds = raw.hideLineItemIds.filter((k) => typeof k === 'string')
  if (Array.isArray(raw?.showLineItemIds)) patch.showLineItemIds = raw.showLineItemIds.filter((k) => typeof k === 'string')
  if (raw?.clearHighlights) patch.clearHighlights = true
  if (Array.isArray(raw?.removeHighlightIds)) patch.removeHighlightIds = raw.removeHighlightIds.filter((k) => typeof k === 'string')
  if (Array.isArray(raw?.addHighlights)) {
    patch.addHighlights = raw.addHighlights
      .filter((h) => Boolean(h?.selector))
      .map((h, index) => ({
        id: typeof h.id === 'string' && h.id ? h.id : `hl-${Date.now()}-${index}`,
        selector: h.selector!,
        color: typeof h.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(h.color) ? h.color : HL_PALETTE.yellow,
        note: typeof h.note === 'string' ? h.note : undefined,
      }))
  }
  if (Array.isArray(raw?.addDerivedColumns)) {
    patch.addDerivedColumns = raw.addDerivedColumns
      .filter((c) => Boolean(c?.key && c?.label && c?.formula))
      .map((c) => ({
        key: String(c.key),
        label: String(c.label),
        formula: String(c.formula),
        insertAfterColKey: typeof c.insertAfterColKey === 'string' ? c.insertAfterColKey : undefined,
      }))
  }
  if (Array.isArray(raw?.removeDerivedColumnKeys)) patch.removeDerivedColumnKeys = raw.removeDerivedColumnKeys.filter((k) => typeof k === 'string')
  if (Array.isArray(raw?.addManualColumns)) {
    patch.addManualColumns = raw.addManualColumns
      .filter((c) => Boolean(c?.key && c?.label))
      .map((c) => ({
        key: String(c.key),
        label: String(c.label),
        insertAfterColKey: typeof c.insertAfterColKey === 'string' ? c.insertAfterColKey : undefined,
      }))
  }
  if (Array.isArray(raw?.addManualLineItems)) {
    patch.addManualLineItems = raw.addManualLineItems
      .filter((r) => Boolean(r?.id))
      .map((r) => ({
        id: String(r.id),
        sku: typeof r.sku === 'string' ? r.sku : '',
        description: typeof r.description === 'string' ? r.description : '',
        quantity: typeof r.quantity === 'number' ? r.quantity : 0,
        unit: typeof r.unit === 'string' ? r.unit : '',
        insertAfterLineItemId: typeof r.insertAfterLineItemId === 'string' ? r.insertAfterLineItemId : undefined,
      }))
  }
  if (Array.isArray(raw?.setCells)) {
    patch.setCells = raw.setCells
      .filter((cell) => typeof cell?.rowKey === 'string' && typeof cell?.colKey === 'string')
      .map((cell) => ({ rowKey: cell.rowKey, colKey: cell.colKey, value: cell.value == null ? '' : String(cell.value) }))
  }
  if (Array.isArray(raw?.setColumnLabels)) {
    patch.setColumnLabels = raw.setColumnLabels
      .filter((col) => typeof col?.colKey === 'string' && typeof col?.label === 'string')
      .map((col) => ({ colKey: col.colKey, label: col.label }))
  }
  if (Array.isArray(raw?.setLineItemOrder)) patch.setLineItemOrder = raw.setLineItemOrder.filter((id) => typeof id === 'string')
  if (raw?.sortRowsByColumn && typeof raw.sortRowsByColumn.colKey === 'string') {
    patch.sortRowsByColumn = {
      colKey: raw.sortRowsByColumn.colKey,
      direction: raw.sortRowsByColumn.direction === 'desc' ? 'desc' : 'asc',
    }
  }
  if (typeof raw?.filterBlankRowsByColumnKey === 'string') patch.filterBlankRowsByColumnKey = raw.filterBlankRowsByColumnKey
  return patch
}

export function fallbackComparisonPatch(request: ComparisonPatchRequest): ComparisonViewPatch {
  const message = normalizeCommandWords(request.message)
  const trimmedMessage = message.trim()
  const lower = message.toLowerCase().trim()
  const cols = request.sheetSchema?.columns ?? []
  const items = request.sheetSchema?.lineItems ?? []
  const color = pickColor(message)

  if (/\b(clear|reset|remove all)\b.*(highlight|color|colour)/.test(lower)) {
    return { summary: 'Cleared all comparison highlights.', clearHighlights: true }
  }

  if (/\b(fastest|quickest|shortest)\b/.test(lower) && /\b(lead|delivery|ship)/.test(lower)) {
    return {
      summary: 'Highlighted the fastest vendor lead time on each line item.',
      addHighlights: [{ id: `hl-fastest-lead-${Date.now()}`, selector: { kind: 'rule', rule: 'fastest-lead-per-row' }, color: HL_PALETTE.green }],
    }
  }

  if (/\b(lowest|cheapest)\b/.test(lower) && /\b(price|cost|bid|total|quote)/.test(lower)) {
    return {
      summary: 'Highlighted the lowest eligible price on each line item.',
      addHighlights: [{ id: `hl-lowest-price-${Date.now()}`, selector: { kind: 'rule', rule: 'lowest-price-per-row' }, color: HL_PALETTE.green }],
    }
  }

  if (/\b(hide|remove|drop|clean(?:up)?)\b.*\b(empty|blank|unused|no data)\b.*\bcol/.test(lower) || /\bhide\s+(all\s+)?(the\s+)?empty\b/.test(lower)) {
    const empties = cols.filter((c) => c.isEmpty && !isCorePinned(c.key))
    return empties.length
      ? { summary: `Hid ${empties.length} empty column${empties.length === 1 ? '' : 's'}.`, hideColumnKeys: empties.map((c) => c.key) }
      : { summary: 'No empty columns were found.' }
  }

  if (/\b(show|unhide|restore|reveal)\b.*\b(all|hidden|every)\b/.test(lower)) {
    return { summary: 'Restored hidden columns and rows.', showColumnKeys: cols.map((c) => c.key), showLineItemIds: items.map((i) => i.id) }
  }

  const showColumnMatch = trimmedMessage.match(/\b(show|unhide|restore|reveal|bring back|put back)\s+(?:the\s+)?(.+?)\s*(?:column|columns)\s*$/i)
  if (showColumnMatch) {
    const target = showColumnMatch[2].trim()
    const matches = findColumnsByPhrase(cols, target)
    if (matches.length > 0) {
      return {
        summary: `Restored ${matches.length} column${matches.length === 1 ? '' : 's'} matching "${target}".`,
        showColumnKeys: matches.map((m) => m.key),
      }
    }
  }

  const showRowMatch = trimmedMessage.match(/\b(show|unhide|restore|reveal|bring back|put back)\s+(?:the\s+)?(?:row|item|line item)\s+(.+)$/i)
    ?? trimmedMessage.match(/\b(show|unhide|restore|reveal|bring back|put back)\s+(?:the\s+)?(.+?)\s+row\s*$/i)
  if (showRowMatch) {
    const target = showRowMatch[2].trim()
    const matches = findItemsByPhrase(items, target)
    if (matches.length > 0) {
      return {
        summary: `Restored ${matches.length} row${matches.length === 1 ? '' : 's'} matching "${target}".`,
        showLineItemIds: matches.map((m) => m.id),
      }
    }
  }

  const clearCellMatch = trimmedMessage.match(/\b(clear|blank|empty)\s+(?:the\s+)?(.+?)\s+cell\s+(?:for|in|on)\s+(.+)$/i)
  if (clearCellMatch) {
    const col = findColumnsByPhrase(cols, clearCellMatch[2].trim())[0]
    const item = findItemsByPhrase(items, clearCellMatch[3].trim())[0]
    if (col && item) {
      return {
        summary: `Cleared ${col.label} for ${item.description}.`,
        setCells: [{ rowKey: item.id, colKey: col.key, value: '' }],
      }
    }
  }

  const setCellMatch = trimmedMessage.match(/\b(?:set|change|update)\s+(?:the\s+)?(.+?)\s+(?:cell\s+)?(?:for|in|on)\s+(.+?)\s+(?:to|as)\s+(.+)$/i)
  if (setCellMatch) {
    const col = findColumnsByPhrase(cols, setCellMatch[1].trim())[0]
    const item = findItemsByPhrase(items, setCellMatch[2].trim())[0]
    const value = setCellMatch[3].trim()
    if (col && item) {
      return {
        summary: `Set ${col.label} for ${item.description}.`,
        setCells: [{ rowKey: item.id, colKey: col.key, value }],
      }
    }
  }

  const derivedKlfMatch = trimmedMessage.match(/\b(?:add|insert|create)\b[^.]*\bcolumn\b[^.]*\b(?:to\s+)?(right\s+of|after|left\s+of|before)\s+(.+?)(?:,|$)/i)
  if (derivedKlfMatch && /\b(thousand|1000|kilo|k\s*lf|klf)\b/i.test(trimmedMessage) && /\b(linear\s+feet|lf|feet|ft)\b/i.test(trimmedMessage)) {
    const side = derivedKlfMatch[1].toLowerCase()
    const anchor = findColumnsByPhrase(cols, derivedKlfMatch[2].trim())[0]
    if (anchor) {
      const label = `${anchor.label} (kLF)`
      return {
        summary: `Added ${label} ${side.includes('left') || side === 'before' ? 'left' : 'right'} of ${anchor.label}.`,
        addDerivedColumns: [{
          key: stableKey(label, 'derived-col'),
          label,
          formula: `divide(column.${anchor.key},1000)`,
          insertAfterColKey: side.includes('left') || side === 'before' ? columnBefore(cols, anchor.key) : anchor.key,
        }],
      }
    }
  }

  const insertColumnMatch = lower.match(/\b(?:add|insert|create)\b[^.]*\bcolumn\b[^.]*\b(left\s+of|before|right\s+of|after)\s+(.+?)\s*(?:column)?\s*$/)
    ?? lower.match(/\b(?:add|insert|create)\s+(?:a\s+)?column\b/)
  if (insertColumnMatch) {
    const side = insertColumnMatch[1]
    const target = insertColumnMatch[2]?.trim()
    const anchor = target ? findColumnsByPhrase(cols, target)[0] : cols.at(-1)
    if (!target || anchor) {
      return {
        summary: anchor
          ? `Inserted an editable column ${side?.includes('left') || side === 'before' ? 'left' : 'right'} of ${anchor.label}.`
          : 'Inserted an editable column.',
        addManualColumns: [{
          key: stableKey('column', 'manual-col'),
          label: 'New Column',
          insertAfterColKey: side?.includes('left') || side === 'before' ? columnBefore(cols, anchor?.key) : anchor?.key,
        }],
      }
    }
  }

  const insertRowMatch = lower.match(/\b(?:add|insert|create)\b[^.]*\brow\b[^.]*\b(above|before|below|after)\s+(.+?)\s*$/)
    ?? lower.match(/\b(?:add|insert|create)\s+(?:a\s+)?row\b/)
  if (insertRowMatch) {
    const side = insertRowMatch[1]
    const target = insertRowMatch[2]?.trim()
    const anchor = target ? findItemsByPhrase(items, target)[0] : undefined
    const anchorIndex = anchor ? items.findIndex((item) => item.id === anchor.id) : -1
    if (!target || anchor) {
      return {
        summary: anchor
          ? `Inserted a blank editable row ${side === 'above' || side === 'before' ? 'above' : 'below'} ${anchor.description}.`
          : 'Inserted a blank editable row.',
        addManualLineItems: [{
          id: `manual-row-${Date.now()}`,
          sku: '',
          description: '',
          quantity: 0,
          unit: '',
          insertAfterLineItemId: side === 'above' || side === 'before'
            ? (anchorIndex > 0 ? items[anchorIndex - 1]?.id : '__before_first__')
            : anchor?.id,
        }],
      }
    }
  }

  const renameColumnMatch = trimmedMessage.match(/\brename\s+(?:the\s+)?(.+?)\s+column\s+(?:to|as)\s+(.+)$/i)
    ?? trimmedMessage.match(/\brename\s+column\s+(.+?)\s+(?:to|as)\s+(.+)$/i)
  if (renameColumnMatch) {
    const matches = findColumnsByPhrase(cols, renameColumnMatch[1].trim())
    if (matches.length > 0) {
      return {
        summary: `Renamed ${matches[0].label} to ${renameColumnMatch[2].trim()}.`,
        setColumnLabels: [{ colKey: matches[0].key, label: renameColumnMatch[2].trim() }],
      }
    }
  }

  const sortMatch = lower.match(/\bsort\b\s+(?:by\s+)?(.+?)\s+(ascending|asc|a\s*to\s*z|descending|desc|z\s*to\s*a)\s*$/)
    ?? lower.match(/\bsort\s+(ascending|asc|a\s*to\s*z|descending|desc|z\s*to\s*a)\s+(?:by\s+)?(.+?)\s*$/)
  if (sortMatch) {
    const firstIsDirection = /^(ascending|asc|a\s*to\s*z|descending|desc|z\s*to\s*a)$/.test(sortMatch[1])
    const directionText = firstIsDirection ? sortMatch[1] : sortMatch[2]
    const target = firstIsDirection ? sortMatch[2] : sortMatch[1]
    const matches = findColumnsByPhrase(cols, target.trim())
    if (matches.length > 0) {
      return {
        summary: `Sorted rows by ${matches[0].label} ${/\b(desc|descending|z\s*to\s*a)\b/.test(directionText) ? 'descending' : 'ascending'}.`,
        sortRowsByColumn: { colKey: matches[0].key, direction: /\b(desc|descending|z\s*to\s*a)\b/.test(directionText) ? 'desc' : 'asc' },
      }
    }
  }

  const filterBlankMatch = lower.match(/\b(?:filter|hide)\b[^.]*\bblank(?:s)?\b[^.]*\b(?:in|for|from)\s+(.+?)(?:\s+column)?\s*$/)
  if (filterBlankMatch) {
    const matches = findColumnsByPhrase(cols, filterBlankMatch[1].trim())
    if (matches.length > 0) {
      return { summary: `Filtered blank rows in ${matches[0].label}.`, filterBlankRowsByColumnKey: matches[0].key }
    }
  }

  const highlightRowMatch = lower.match(/\b(highlight|mark|color|colour|flag)\s+(?:the\s+)?(?:row\s+(?:for\s+|containing\s+|with\s+)?)?(.+?)\s+row\b/)
    ?? lower.match(/\b(highlight|mark|color|colour|flag)\s+(?:the\s+)?row\s+(?:for\s+|containing\s+|with\s+)?(.+?)\s*$/)
    ?? lower.match(/\b(highlight|mark|color|colour|flag)\s+(?:the\s+)?(.+?)\s+line\s*item\s*$/)
  if (highlightRowMatch) {
    const target = highlightRowMatch[2].trim()
    const matched = findItemsByPhrase(items, target)
    if (matched.length > 0) {
      return {
        summary: `Highlighted ${matched.length} row${matched.length === 1 ? '' : 's'} matching "${target}".`,
        addHighlights: matched.flatMap((item) =>
          cols.filter((c) => !isCorePinned(c.key)).map((c, index) => ({
            id: `hl-row-${item.id}-${Date.now()}-${index}`,
            selector: { kind: 'cell' as const, rowKey: item.id, colKey: c.key },
            color,
          })),
        ),
      }
    }
  }

  const highlightColMatch = lower.match(/\b(highlight|mark|color|colour|flag)\s+(?:the\s+)?(.+?)\s+column(?:s)?\b/)
    ?? lower.match(/\b(highlight|mark|color|colour|flag)\s+column(?:s)?\s+(.+?)\s*$/)
  if (highlightColMatch) {
    const target = highlightColMatch[2].trim()
    const matched = findColumnsByPhrase(cols, target)
    if (matched.length > 0) {
      return {
        summary: `Highlighted ${matched.length} column${matched.length === 1 ? '' : 's'} matching "${target}".`,
        addHighlights: matched.flatMap((col) =>
          items.map((item, index) => ({
            id: `hl-col-${col.key}-${Date.now()}-${index}`,
            selector: { kind: 'cell' as const, rowKey: item.id, colKey: col.key },
            color,
          })),
        ),
      }
    }
  }

  const hideMatch = lower.match(/\b(hide|remove|delete|drop)\s+(?:the\s+)?(.+?)\s*(?:column|columns)?\s*$/)
  if (hideMatch) {
    const verb = hideMatch[1]
    const target = hideMatch[2].trim()
    const matches = findColumnsByPhrase(cols, target)
    if (matches.length > 0) {
      return verb === 'hide'
        ? { summary: `Hid ${matches.length} column${matches.length === 1 ? '' : 's'} matching "${target}".`, hideColumnKeys: matches.map((m) => m.key) }
        : { summary: `Deleted ${matches.length} column${matches.length === 1 ? '' : 's'} matching "${target}".`, deleteColumnKeys: matches.map((m) => m.key) }
    }
  }

  const hideRowMatch = lower.match(/\b(hide|remove|delete|drop)\s+(?:the\s+)?(?:row|item|line item)\s+(.+)$/)
    ?? lower.match(/\b(hide|remove|delete|drop)\s+(?:the\s+)?(.+?)\s+row\s*$/)
  if (hideRowMatch) {
    const verb = hideRowMatch[1]
    const target = hideRowMatch[2].trim()
    const matches = findItemsByPhrase(items, target)
    if (matches.length > 0) {
      return verb === 'hide'
        ? { summary: `Hid ${matches.length} row${matches.length === 1 ? '' : 's'} matching "${target}".`, hideLineItemIds: matches.map((m) => m.id) }
        : { summary: `Deleted ${matches.length} row${matches.length === 1 ? '' : 's'} matching "${target}".`, deleteLineItemIds: matches.map((m) => m.id) }
    }
  }

  return {
    summary: 'I can preview comparison changes like highlighting lowest eligible prices, fastest lead times, risky/partial rows, hiding empty columns, or restoring hidden columns.',
  }
}

function buildComparisonPatchPrompt(request: ComparisonPatchRequest) {
  return [
    'You are Rialto Agent, controlling a visible construction quote comparison sheet.',
    'Convert the user instruction into a safe preview patch. Do not claim to send emails, select vendors, notify vendors, or mutate hidden backend state.',
    'The comparison spec: partial quotes may be shown but must not be crowned as lowest complete; quantity mismatches, no-bids, alternates, and unresolved scope need visible caveats; agent edits are previewed and highlighted for review.',
    'Use only real column keys, line item ids, and rule names from the schema.',
    'Return JSON only with this shape: {"summary":"...","deleteColumnKeys":[],"hideColumnKeys":[],"showColumnKeys":[],"deleteLineItemIds":[],"hideLineItemIds":[],"showLineItemIds":[],"addHighlights":[{"id":"...","selector":{"kind":"rule","rule":"lowest-price-per-row"},"color":"#bbf7d0","note":"..."}],"removeHighlightIds":[],"clearHighlights":false,"addDerivedColumns":[],"removeDerivedColumnKeys":[],"addManualColumns":[],"addManualLineItems":[],"setCells":[],"setColumnLabels":[],"setLineItemOrder":[],"sortRowsByColumn":{"colKey":"...","direction":"asc"},"filterBlankRowsByColumnKey":"..."}.',
    'For spreadsheet-like delete/remove/drop row or column requests, return deleteColumnKeys or deleteLineItemIds. For hide requests, return hideColumnKeys or hideLineItemIds. For insert row/column, rename column, sort rows, filter blanks, and clear/edit cells, return the matching visible sheet patch fields.',
    'Allowed semantic rules: fastest-lead-per-row, lowest-price-per-row, highest-coverage-overall.',
    'Allowed colors: #fef3c7 yellow review, #bbf7d0 green favorable, #fecaca red risk, #bae6fd blue vendor update, #e9d5ff violet alternate/scope.',
    'If the request is analytical, produce a visible highlight/column patch and an honest summary. If unsupported, return only a helpful summary and no structural edits.',
    '',
    `Sheet schema: ${JSON.stringify(request.sheetSchema ?? {})}`,
    `Current view: ${JSON.stringify(request.currentView ?? {})}`,
    `User instruction: ${request.message}`,
  ].join('\n')
}

export async function proposeComparisonPatch(request: ComparisonPatchRequest): Promise<{ patch: ComparisonViewPatch; usedFallback: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { patch: fallbackComparisonPatch(request), usedFallback: true }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
      messages: [
        { role: 'system', content: 'Return valid JSON only.' },
        { role: 'user', content: buildComparisonPatchPrompt(request) },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 1800,
    }),
  })
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
  if (!response.ok) throw new Error(json.error?.message ?? `OpenAI comparison patch failed (${response.status}).`)
  const text = json.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenAI returned an empty comparison patch.')
  return { patch: normalizePatch(parseJson<Partial<ComparisonViewPatch>>(text)), usedFallback: false }
}
