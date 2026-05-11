interface SheetSchemaColumn {
  key: string
  label: string
}

interface SheetSchemaLineItem {
  id: string
  description: string
  values?: Record<string, string>
}

export interface ComparisonAgentToolSchema {
  columns?: SheetSchemaColumn[]
  lineItems?: SheetSchemaLineItem[]
}

export interface ComparisonAgentToolPatch {
  summary: string
  operations?: Array<
    | { kind: 'set-cell'; rowId: string; columnId: string; value: string | number | boolean | null }
    | { kind: 'highlight-range'; range: string; color: 'red' | 'orange' | 'blue' | 'green' | 'yellow'; note: string }
    | { kind: 'delete-column'; columnId: string }
    | { kind: 'hide-column'; columnId: string }
    | { kind: 'show-column'; columnId: string }
    | { kind: 'delete-row'; rowId: string }
    | { kind: 'hide-row'; rowId: string }
    | { kind: 'show-row'; rowId: string }
    | { kind: 'insert-column'; columnId: string; label: string; afterColumnId?: string; beforeColumnId?: string }
    | { kind: 'insert-row'; rowId: string; afterRowId?: string; beforeRowId?: string }
    | { kind: 'rename-column'; columnId: string; label: string }
    | { kind: 'sort-rows'; columnId: string; direction: 'asc' | 'desc' }
    | { kind: 'filter-rows'; columnId: string; predicate: 'non-empty' | 'empty' }
    | { kind: 'add-derived-column'; columnId: string; label: string; formula: string; afterColumnId?: string; beforeColumnId?: string }
    | { kind: 'bulk-adjust-number-column'; columnId: string; amount: number; dependentColumnId?: string; dependentFormula?: 'multiply-by-quantity' }
    | { kind: 'rename-sheet'; title: string }
  >
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
  addManualColumns?: Array<{ key: string; label: string; insertAfterColKey?: string }>
  addManualLineItems?: Array<{ id: string; sku: string; description: string; quantity: number; unit: string; insertAfterLineItemId?: string }>
  addDerivedColumns?: Array<{ key: string; label: string; formula: string; insertAfterColKey?: string }>
  setCells?: Array<{ rowKey: string; colKey: string; value: string }>
  setColumnLabels?: Array<{ colKey: string; label: string }>
  sortRowsByColumn?: { colKey: string; direction: 'asc' | 'desc' }
  filterBlankRowsByColumnKey?: string
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function findColumnKey(schema: ComparisonAgentToolSchema, columnId: string) {
  const target = normalize(columnId)
  const columns = schema.columns ?? []
  return columns.find((column) => normalize(column.key) === target)?.key
    ?? columns.find((column) => normalize(column.label) === target)?.key
    ?? columns.find((column) => normalize(column.label).includes(target))?.key
    ?? columns.find((column) => normalize(column.key).includes(target))?.key
    ?? columnId
}

function findLineItemId(schema: ComparisonAgentToolSchema, rowId: string) {
  const target = normalize(rowId)
  const lineItems = schema.lineItems ?? []
  return lineItems.find((item) => normalize(item.id) === target)?.id
    ?? lineItems.find((item) => normalize(item.description) === target)?.id
    ?? lineItems.find((item) => normalize(item.description).includes(target))?.id
    ?? lineItems.find((item) => normalize(item.id).includes(target))?.id
    ?? rowId
}

function append<T>(items: T[] | undefined, item: T) {
  return [...(items ?? []), item]
}

function parseNumber(value: string | undefined) {
  if (!value) return null
  const normalized = value.replace(/[$,\sA-Za-z]/g, '')
  const number = Number(normalized)
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

function quantityColumnKey(schema: ComparisonAgentToolSchema) {
  return schema.columns?.find((column) => normalize(column.key) === 'qty unit')?.key
    ?? schema.columns?.find((column) => normalize(column.label) === 'qty')?.key
    ?? schema.columns?.find((column) => normalize(column.label).includes('quantity'))?.key
}

export function comparisonViewPatchFromAgentToolPatch(
  toolPatch: ComparisonAgentToolPatch,
  schema: ComparisonAgentToolSchema,
): ComparisonViewPatch {
  let patch: ComparisonViewPatch = { summary: toolPatch.summary }
  for (const operation of toolPatch.operations ?? []) {
    if (operation.kind === 'delete-column') patch = { ...patch, deleteColumnKeys: append(patch.deleteColumnKeys, findColumnKey(schema, operation.columnId)) }
    else if (operation.kind === 'hide-column') patch = { ...patch, hideColumnKeys: append(patch.hideColumnKeys, findColumnKey(schema, operation.columnId)) }
    else if (operation.kind === 'show-column') patch = { ...patch, showColumnKeys: append(patch.showColumnKeys, findColumnKey(schema, operation.columnId)) }
    else if (operation.kind === 'delete-row') patch = { ...patch, deleteLineItemIds: append(patch.deleteLineItemIds, findLineItemId(schema, operation.rowId)) }
    else if (operation.kind === 'hide-row') patch = { ...patch, hideLineItemIds: append(patch.hideLineItemIds, findLineItemId(schema, operation.rowId)) }
    else if (operation.kind === 'show-row') patch = { ...patch, showLineItemIds: append(patch.showLineItemIds, findLineItemId(schema, operation.rowId)) }
    else if (operation.kind === 'set-cell') {
      patch = {
        ...patch,
        setCells: append(patch.setCells, {
          rowKey: findLineItemId(schema, operation.rowId),
          colKey: findColumnKey(schema, operation.columnId),
          value: operation.value == null ? '' : String(operation.value),
        }),
      }
    } else if (operation.kind === 'rename-column') {
      patch = { ...patch, setColumnLabels: append(patch.setColumnLabels, { colKey: findColumnKey(schema, operation.columnId), label: operation.label }) }
    } else if (operation.kind === 'sort-rows') {
      patch = { ...patch, sortRowsByColumn: { colKey: findColumnKey(schema, operation.columnId), direction: operation.direction } }
    } else if (operation.kind === 'filter-rows') {
      patch = { ...patch, filterBlankRowsByColumnKey: findColumnKey(schema, operation.columnId) }
    } else if (operation.kind === 'insert-column') {
      patch = {
        ...patch,
        addManualColumns: append(patch.addManualColumns, {
          key: operation.columnId,
          label: operation.label,
          insertAfterColKey: operation.afterColumnId ? findColumnKey(schema, operation.afterColumnId) : undefined,
        }),
      }
    } else if (operation.kind === 'insert-row') {
      patch = {
        ...patch,
        addManualLineItems: append(patch.addManualLineItems, {
          id: operation.rowId,
          sku: '',
          description: '',
          quantity: 0,
          unit: '',
          insertAfterLineItemId: operation.afterRowId ? findLineItemId(schema, operation.afterRowId) : undefined,
        }),
      }
    } else if (operation.kind === 'add-derived-column') {
      patch = {
        ...patch,
        addDerivedColumns: append(patch.addDerivedColumns, {
          key: operation.columnId,
          label: operation.label,
          formula: operation.formula,
          insertAfterColKey: operation.afterColumnId ? findColumnKey(schema, operation.afterColumnId) : undefined,
        }),
      }
    } else if (operation.kind === 'bulk-adjust-number-column') {
      const colKey = findColumnKey(schema, operation.columnId)
      const dependentColKey = operation.dependentColumnId ? findColumnKey(schema, operation.dependentColumnId) : undefined
      const qtyKey = operation.dependentFormula === 'multiply-by-quantity' ? quantityColumnKey(schema) : undefined
      for (const item of schema.lineItems ?? []) {
        const current = parseNumber(item.values?.[colKey])
        if (current == null) continue
        const adjusted = current + operation.amount
        patch = {
          ...patch,
          setCells: append(patch.setCells, { rowKey: item.id, colKey, value: formatMoney(adjusted) }),
        }
        const quantity = qtyKey ? parseLeadingNumber(item.values?.[qtyKey]) : null
        if (dependentColKey && quantity != null) {
          patch = {
            ...patch,
            setCells: append(patch.setCells, { rowKey: item.id, colKey: dependentColKey, value: formatMoney(adjusted * quantity) }),
          }
        }
      }
    } else if (operation.kind === 'highlight-range' && operation.range === 'lowest-complete-comparable-quote') {
      patch = {
        ...patch,
        addHighlights: append(patch.addHighlights, {
          id: `hl-lowest-complete-${Date.now()}`,
          selector: { kind: 'rule', rule: 'lowest-price-per-row' },
          color: '#bbf7d0',
          note: operation.note,
        }),
      }
    }
  }
  return patch
}
