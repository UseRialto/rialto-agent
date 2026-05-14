import type { ComparisonViewPatch } from './comparison-agent-tools'

interface SheetColumn {
  key: string
  label: string
  metric?: string
}

interface SheetLineItem {
  id: string
  description: string
  values?: Record<string, string>
}

export interface ComparisonFastCommandSchema {
  columns?: SheetColumn[]
  lineItems?: SheetLineItem[]
}

export type ComparisonHistoryCommand = 'undo' | 'redo'
export type ComparisonHistoryResolution =
  | { action: 'discard-preview' }
  | { action: 'undo-version' }
  | { action: 'redo-version' }
  | { action: 'unavailable'; command: ComparisonHistoryCommand }

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function columnText(column: SheetColumn) {
  return normalize(`${column.key} ${column.label} ${column.metric ?? ''}`)
}

function isAlternateColumn(column: SheetColumn) {
  const text = columnText(column)
  return /\balt\b|\balternate\b/.test(text)
}

function isLeadColumn(column: SheetColumn) {
  const text = columnText(column)
  return /\blead\b|\bleadtime\b|\blead time\b|\beta\b/.test(text)
}

function parseLeadDays(value: string | undefined) {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text || /^(?:n\/a|na|tbd|no bid|none)$/i.test(text)) return null
  const number = Number.parseFloat(text.replace(/,/g, ''))
  if (!Number.isFinite(number)) return null
  if (/\bweeks?\b/.test(text)) return number * 7
  return number
}

function extractQuotedPhrase(message: string, after: RegExp) {
  const lower = message.toLowerCase()
  const match = lower.match(after)
  return normalize(match?.[1] ?? '')
}

function findLineItem(schema: ComparisonFastCommandSchema, phrase: string) {
  if (!phrase) return undefined
  const target = normalize(phrase)
  const targetTokens = target.split(' ').filter(Boolean)
  return (schema.lineItems ?? []).find((item) => {
    const haystack = normalize(`${item.id} ${item.description}`)
    return haystack.includes(target) || targetTokens.every((token) => haystack.includes(token))
  })
}

function fastSetAllAlternateCells(message: string, schema: ComparisonFastCommandSchema): ComparisonViewPatch | null {
  const match = message.match(/\b(?:make|set|change|fill)\s+(?:all\s+)?(?:alt|alternate)\s+(?:cells?|columns?)\s+(?:(?:to|=)\s*)?([^\s,.;]+)/i)
  if (!match) return null
  const value = match[1]
  const alternateColumns = (schema.columns ?? []).filter(isAlternateColumn)
  const rows = schema.lineItems ?? []
  const setCells = rows.flatMap((row) => alternateColumns.map((column) => ({
    rowKey: row.id,
    colKey: column.key,
    value,
  })))
  if (!setCells.length) return null
  return {
    summary: `Set ${setCells.length} alternate cell${setCells.length === 1 ? '' : 's'} to ${value}.`,
    setCells,
  }
}

function fastHighlightLowestLeadForLine(message: string, schema: ComparisonFastCommandSchema): ComparisonViewPatch | null {
  if (!/\bhighlight\b/i.test(message) || !/\b(?:lowest|fastest|shortest|best)\b/i.test(message) || !/\blead\b/i.test(message)) {
    return null
  }
  const phrase = extractQuotedPhrase(message, /\bfor\s+(.+)$/i)
  const row = findLineItem(schema, phrase)
  if (!row) return null
  const leadColumns = (schema.columns ?? []).filter(isLeadColumn)
  const candidates = leadColumns
    .map((column) => ({ column, days: parseLeadDays(row.values?.[column.key]) }))
    .filter((candidate): candidate is { column: SheetColumn; days: number } => candidate.days != null)
  if (!candidates.length) return null
  const lowest = Math.min(...candidates.map((candidate) => candidate.days))
  const winners = candidates.filter((candidate) => candidate.days === lowest)
  return {
    summary: `Highlighted the lowest lead time for ${row.description}.`,
    addHighlights: winners.map((winner) => ({
      id: `hl-lowest-lead-${row.id}-${winner.column.key}`,
      selector: { kind: 'cell' as const, rowKey: row.id, colKey: winner.column.key },
      color: '#bae6fd',
      note: `Lowest visible lead time for ${row.description}.`,
    })),
  }
}

export function comparisonFastCommandPatch(message: string, schema: ComparisonFastCommandSchema): ComparisonViewPatch | null {
  const fastPatch =
    fastSetAllAlternateCells(message, schema) ??
    fastHighlightLowestLeadForLine(message, schema)

  return fastPatch
    ? {
        ...fastPatch,
        agentProposal: {
          kind: 'fast-comparison-command',
          message,
          generatedAt: new Date().toISOString(),
        },
      }
    : null
}

export function comparisonHistoryCommand(message: string): ComparisonHistoryCommand | null {
  const text = normalize(message)
  if (/^(undo|revert|roll back|rollback)(?:\b|$)/.test(text)) return 'undo'
  if (/^(redo|re apply|reapply)(?:\b|$)/.test(text)) return 'redo'
  return null
}

export function resolveComparisonHistoryRequest(
  message: string,
  state: {
    hasPendingPreview: boolean
    canUndoSavedVersion: boolean
    canRedoSavedVersion: boolean
  },
): ComparisonHistoryResolution | null {
  const command = comparisonHistoryCommand(message)
  if (!command) return null
  if (command === 'undo' && state.hasPendingPreview) return { action: 'discard-preview' }
  if (command === 'undo' && state.canUndoSavedVersion) return { action: 'undo-version' }
  if (command === 'redo' && state.canRedoSavedVersion) return { action: 'redo-version' }
  return { action: 'unavailable', command }
}
