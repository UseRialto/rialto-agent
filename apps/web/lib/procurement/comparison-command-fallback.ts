export interface ComparisonCommandColumn {
  key: string
  label: string
  kind: 'rfq-core' | 'rfq-attribute' | 'rfq-standard' | 'vendor' | 'derived' | 'manual'
  isEmpty?: boolean
}

export interface ComparisonCommandSchema {
  columns?: ComparisonCommandColumn[]
}

export interface ComparisonCommandDerivedColumnPatch {
  key: string
  label: string
  formula: string
  insertAfterColKey?: string
}

export interface ComparisonCommandPatch {
  summary: string
  addDerivedColumns?: ComparisonCommandDerivedColumnPatch[]
  addManualColumns?: Array<{ key: string; label: string; insertAfterColKey?: string }>
  addManualLineItems?: Array<{ id: string; sku: string; description: string; quantity: number; unit: string; insertAfterLineItemId?: string }>
}

function normalizePhrase(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function findColumnByPhrase(columns: ComparisonCommandColumn[], phrase: string) {
  const target = normalizePhrase(phrase).replace(/\b(the|a|an)\b/g, '').trim()
  if (!target) return undefined
  return columns.find((col) => normalizePhrase(col.label) === target)
    ?? columns.find((col) => normalizePhrase(col.label).includes(target))
    ?? columns.find((col) => normalizePhrase(col.key).includes(target))
}

function stableColumnKey(label: string, insertAfterColKey?: string) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const anchor = insertAfterColKey?.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() ?? 'column'
  return `${anchor}-${slug || 'derived'}`
}

export function proposeComparisonCommandFallback(message: string, schema: ComparisonCommandSchema | undefined): ComparisonCommandPatch | null {
  const lower = message.toLowerCase()
  const columns = schema?.columns ?? []
  const insertRowMatch = lower.match(/\b(?:add|insert|create)\b[^.]*\brow\b/)
  if (insertRowMatch) {
    return {
      summary: 'Inserted a blank editable row.',
      addManualLineItems: [{
        id: `manual-row-${Date.now()}`,
        sku: '',
        description: '',
        quantity: 0,
        unit: '',
      }],
    }
  }

  const addColumnMatch = lower.match(/\b(?:add|insert|create)\b[^.]*\bcolumn\b[^.]*\b(?:right\s+of|after)\s+(.+?)(?:,|$)/)
    ?? lower.match(/\b(?:add|insert|create)\b[^.]*\b(?:right\s+of|after)\s+(.+?)\s+column\b/)
    ?? lower.match(/\b(?:add|insert|create)\b[^.]*\bcolumn\b/)
  if (!addColumnMatch) return null

  const anchor = addColumnMatch[1] ? findColumnByPhrase(columns, addColumnMatch[1]) : columns[columns.length - 1]
  if (!anchor && addColumnMatch[1]) return null

  if (anchor && /\b(thousand|1000|kilo|k\s*lf|klf)\b/.test(lower) && /\b(linear\s+feet|lf|feet|ft)\b/.test(lower)) {
    const label = `${anchor.label} (kLF)`
    return {
      summary: `Added ${label} to the right of ${anchor.label}.`,
      addDerivedColumns: [{
        key: stableColumnKey(label, anchor.key),
        label,
        formula: `divide(column.${anchor.key},1000)`,
        insertAfterColKey: anchor.key,
      }],
    }
  }

  const label = 'New Column'
  return {
    summary: anchor ? `Inserted an editable column to the right of ${anchor.label}.` : 'Inserted an editable column.',
    addManualColumns: [{
      key: stableColumnKey(label, anchor?.key),
      label,
      insertAfterColKey: anchor?.key,
    }],
  }
}
