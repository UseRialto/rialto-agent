export interface ComparisonCommandColumn {
  key: string
  label: string
  kind: 'rfq-core' | 'rfq-attribute' | 'rfq-standard' | 'vendor' | 'derived' | 'manual'
  isEmpty?: boolean
}

export interface ComparisonCommandSchema {
  columns?: ComparisonCommandColumn[]
  lineItems?: Array<{ id: string; description: string; values?: Record<string, string> }>
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
  deleteColumnKeys?: string[]
  hideColumnKeys?: string[]
  showColumnKeys?: string[]
  deleteLineItemIds?: string[]
  hideLineItemIds?: string[]
  showLineItemIds?: string[]
  setCells?: Array<{ rowKey: string; colKey: string; value: string }>
  setColumnLabels?: Array<{ colKey: string; label: string }>
  sortRowsByColumn?: { colKey: string; direction: 'asc' | 'desc' }
  filterBlankRowsByColumnKey?: string
}

function normalizePhrase(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
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
    if (lower === 'and' || lower === 'then') return word
    const replacement = commandWords.find((candidate) => editDistanceAtMostOne(lower, candidate))
    return replacement ?? word
  })
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

function findLineItemByPhrase(items: Array<{ id: string; description: string }>, phrase: string) {
  const target = normalizePhrase(phrase)
  if (!target) return undefined
  return items.find((item) => normalizePhrase(item.description) === target)
    ?? items.find((item) => normalizePhrase(item.description).includes(target))
    ?? items.find((item) => normalizePhrase(item.id).includes(target))
}

function columnBefore(columns: ComparisonCommandColumn[], key: string | undefined) {
  if (!key) return undefined
  const index = columns.findIndex((col) => col.key === key)
  if (index <= 0) return '__before_first__'
  return columns[index - 1]?.key
}

function parseNumber(value: string | undefined) {
  if (!value) return null
  const number = Number(value.replace(/[$,\sA-Za-z]/g, ''))
  return Number.isFinite(number) ? number : null
}

function parseLeadingNumber(value: string | undefined) {
  if (!value) return null
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const number = Number(match[0])
  return Number.isFinite(number) ? number : null
}

function formatMoney(value: number) {
  const rounded = Math.round(value * 100) / 100
  return rounded.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
  })
}

export function proposeComparisonCommandFallback(message: string, schema: ComparisonCommandSchema | undefined): ComparisonCommandPatch | null {
  const normalizedMessage = normalizeCommandWords(message)
  const lower = normalizedMessage.toLowerCase()
  const columns = schema?.columns ?? []
  const lineItems = schema?.lineItems ?? []
  const showAllMatch = lower.match(/\b(show|unhide|restore|reveal)\b[^.]*\b(all|hidden|every)\b/)
  if (showAllMatch) {
    return {
      summary: 'Restored hidden columns and rows.',
      showColumnKeys: columns.map((c) => c.key),
      showLineItemIds: lineItems.map((item) => item.id),
    }
  }

  const showColumnMatch = normalizedMessage.match(/\b(show|unhide|restore|reveal|bring back|put back)\s+(?:the\s+)?(.+?)\s*(?:column|columns)\s*$/i)
  if (showColumnMatch) {
    const col = findColumnByPhrase(columns, showColumnMatch[2])
    if (col) return { summary: `Restored column matching "${showColumnMatch[2].trim()}".`, showColumnKeys: [col.key] }
  }

  const showRowMatch = normalizedMessage.match(/\b(show|unhide|restore|reveal|bring back|put back)\s+(?:the\s+)?(?:row|item|line item)\s+(.+)$/i)
    ?? normalizedMessage.match(/\b(show|unhide|restore|reveal|bring back|put back)\s+(?:the\s+)?(.+?)\s+row\s*$/i)
  if (showRowMatch) {
    const item = findLineItemByPhrase(lineItems, showRowMatch[2])
    if (item) return { summary: `Restored row matching "${showRowMatch[2].trim()}".`, showLineItemIds: [item.id] }
  }

  const clearCellMatch = normalizedMessage.match(/\b(clear|blank|empty)\s+(?:the\s+)?(.+?)\s+cell\s+(?:for|in|on)\s+(.+)$/i)
  if (clearCellMatch) {
    const col = findColumnByPhrase(columns, clearCellMatch[2])
    const item = findLineItemByPhrase(lineItems, clearCellMatch[3])
    if (col && item) {
      return {
        summary: `Cleared ${col.label} for ${item.description}.`,
        setCells: [{ rowKey: item.id, colKey: col.key, value: '' }],
      }
    }
  }

  const setCellMatch = normalizedMessage.match(/\b(?:set|change|update)\s+(?:the\s+)?(.+?)\s+(?:cell\s+)?(?:for|in|on)\s+(.+?)\s+(?:to|as)\s+(.+)$/i)
  if (setCellMatch) {
    const col = findColumnByPhrase(columns, setCellMatch[1])
    const item = findLineItemByPhrase(lineItems, setCellMatch[2])
    if (col && item) {
      return {
        summary: `Set ${col.label} for ${item.description}.`,
        setCells: [{ rowKey: item.id, colKey: col.key, value: setCellMatch[3].trim() }],
      }
    }
  }

  const hideColumnMatch = lower.match(/\b(hide|remove|delete|drop)\s+(?:the\s+)?(.+?)\s*(?:column|columns)?\s*$/)
  if (hideColumnMatch) {
    const verb = hideColumnMatch[1]
    const target = hideColumnMatch[2].trim()
    const matches = columns.filter((col) => findColumnByPhrase([col], target))
    if (matches.length > 0) {
      return verb === 'hide'
        ? {
            summary: `Hid ${matches.length} column${matches.length === 1 ? '' : 's'} matching "${target}".`,
            hideColumnKeys: matches.map((col) => col.key),
          }
        : {
            summary: `Deleted ${matches.length} column${matches.length === 1 ? '' : 's'} matching "${target}".`,
            deleteColumnKeys: matches.map((col) => col.key),
          }
    }
  }

  const hideRowMatch = lower.match(/\b(hide|remove|delete|drop)\s+(?:the\s+)?(?:row|item|line item)\s+(.+)$/)
    ?? lower.match(/\b(hide|remove|delete|drop)\s+(?:the\s+)?(.+?)\s+row\s*$/)
  if (hideRowMatch) {
    const verb = hideRowMatch[1]
    const item = findLineItemByPhrase(lineItems, hideRowMatch[2])
    if (item) {
      return verb === 'hide'
        ? { summary: `Hid row matching "${hideRowMatch[2].trim()}".`, hideLineItemIds: [item.id] }
        : { summary: `Deleted row matching "${hideRowMatch[2].trim()}".`, deleteLineItemIds: [item.id] }
    }
  }

  const renameColumnMatch = lower.match(/\brename\s+(?:the\s+)?(.+?)\s+column\s+(?:to|as)\s+(.+)$/)
    ?? lower.match(/\brename\s+column\s+(.+?)\s+(?:to|as)\s+(.+)$/)
  if (renameColumnMatch) {
    const col = findColumnByPhrase(columns, renameColumnMatch[1])
    if (col) {
      return {
        summary: `Renamed ${col.label} to ${renameColumnMatch[2].trim()}.`,
        setColumnLabels: [{ colKey: col.key, label: renameColumnMatch[2].trim() }],
      }
    }
  }

  const sortMatch = lower.match(/\bsort\b\s+(?:by\s+)?(.+?)\s+(ascending|asc|a\s*to\s*z|descending|desc|z\s*to\s*a)\s*$/)
    ?? lower.match(/\bsort\s+(ascending|asc|a\s*to\s*z|descending|desc|z\s*to\s*a)\s+(?:by\s+)?(.+?)\s*$/)
  if (sortMatch) {
    const firstIsDirection = /^(ascending|asc|a\s*to\s*z|descending|desc|z\s*to\s*a)$/.test(sortMatch[1])
    const directionText = firstIsDirection ? sortMatch[1] : sortMatch[2]
    const target = firstIsDirection ? sortMatch[2] : sortMatch[1]
    const col = findColumnByPhrase(columns, target)
    if (col) {
      return {
        summary: `Sorted rows by ${col.label} ${/\b(desc|descending|z\s*to\s*a)\b/.test(directionText) ? 'descending' : 'ascending'}.`,
        sortRowsByColumn: { colKey: col.key, direction: /\b(desc|descending|z\s*to\s*a)\b/.test(directionText) ? 'desc' : 'asc' },
      }
    }
  }

  const filterBlankMatch = lower.match(/\b(?:filter|hide)\b[^.]*\bblank(?:s)?\b[^.]*\b(?:in|for|from)\s+(.+?)(?:\s+column)?\s*$/)
  if (filterBlankMatch) {
    const col = findColumnByPhrase(columns, filterBlankMatch[1])
    if (col) return { summary: `Filtered blank rows in ${col.label}.`, filterBlankRowsByColumnKey: col.key }
  }

  const bulkAddMatch = lower.match(/\badd\s+(-?\d+(?:\.\d+)?)\s+(?:to|onto)\s+(?:all\s+)?(?:entries\s+)?(?:in\s+)?(.+?)(?:\s+and\s+(?:then\s+)?update\s+(.+?)(?:\s+according(?:ly)?)?)?\s*$/)
  if (bulkAddMatch) {
    const source = findColumnByPhrase(columns, bulkAddMatch[2])
    const dependent = bulkAddMatch[3] ? findColumnByPhrase(columns, bulkAddMatch[3]) : undefined
    const quantity = findColumnByPhrase(columns, 'qty') ?? findColumnByPhrase(columns, 'quantity')
    if (source) {
      const amount = Number(bulkAddMatch[1])
      const setCells: NonNullable<ComparisonCommandPatch['setCells']> = []
      for (const item of lineItems) {
        const current = parseNumber(item.values?.[source.key])
        if (current == null) continue
        const adjusted = current + amount
        setCells.push({ rowKey: item.id, colKey: source.key, value: formatMoney(adjusted) })
        const qty = quantity ? parseLeadingNumber(item.values?.[quantity.key]) : null
        if (dependent && qty != null) setCells.push({ rowKey: item.id, colKey: dependent.key, value: formatMoney(adjusted * qty) })
      }
      if (setCells.length) return { summary: `Adjusted ${source.label}${dependent ? ` and updated ${dependent.label}` : ''}.`, setCells }
    }
  }

  const insertRowMatch = lower.match(/\b(?:add|insert|create)\b[^.]*\brow\b[^.]*\b(above|before|below|after)\s+(.+?)\s*$/)
    ?? lower.match(/\b(?:add|insert|create)\b[^.]*\brow\b/)
  if (insertRowMatch) {
    const target = insertRowMatch[2]?.trim()
    const anchor = target ? findLineItemByPhrase(lineItems, target) : undefined
    const anchorIndex = anchor ? lineItems.findIndex((item) => item.id === anchor.id) : -1
    const side = insertRowMatch[1]
    return {
      summary: anchor ? `Inserted a blank editable row ${side === 'above' || side === 'before' ? 'above' : 'below'} ${anchor.description}.` : 'Inserted a blank editable row.',
      addManualLineItems: [{
        id: `manual-row-${Date.now()}`,
        sku: '',
        description: '',
        quantity: 0,
        unit: '',
        insertAfterLineItemId: side === 'above' || side === 'before'
          ? (anchorIndex > 0 ? lineItems[anchorIndex - 1]?.id : '__before_first__')
          : anchor?.id,
      }],
    }
  }

  const addColumnMatch = lower.match(/\b(?:add|insert|create)\b[^.]*\bcolumn\b[^.]*\b(left\s+of|before|right\s+of|after)\s+(.+?)(?:,|$)/)
    ?? lower.match(/\b(?:add|insert|create)\b[^.]*\b(?:right\s+of|after)\s+(.+?)\s+column\b/)
    ?? lower.match(/\b(?:add|insert|create)\b[^.]*\bcolumn\b/)
  if (!addColumnMatch) return null

  const side = addColumnMatch[1]
  const anchorPhrase = addColumnMatch[2] ?? addColumnMatch[1]
  const anchor = anchorPhrase && !/^(left\s+of|before|right\s+of|after)$/.test(anchorPhrase) ? findColumnByPhrase(columns, anchorPhrase) : columns[columns.length - 1]
  if (!anchor && anchorPhrase) return null

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
      insertAfterColKey: side === 'left of' || side === 'before' ? columnBefore(columns, anchor?.key) : anchor?.key,
    }],
  }
}
