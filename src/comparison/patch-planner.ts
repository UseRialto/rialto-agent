import { parseJson } from '../agent/llm.js'

export interface SchemaColumn {
  key: string
  label: string
  kind: 'rfq-core' | 'rfq-attribute' | 'rfq-standard' | 'vendor' | 'derived'
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
  hideColumnKeys?: string[]
  showColumnKeys?: string[]
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

function normalizePatch(raw: Partial<ComparisonViewPatch> | null | undefined): ComparisonViewPatch {
  const patch: ComparisonViewPatch = {
    summary: typeof raw?.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : 'Prepared a comparison-sheet preview.',
  }
  if (Array.isArray(raw?.hideColumnKeys)) patch.hideColumnKeys = raw.hideColumnKeys.filter((k) => typeof k === 'string')
  if (Array.isArray(raw?.showColumnKeys)) patch.showColumnKeys = raw.showColumnKeys.filter((k) => typeof k === 'string')
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
  return patch
}

export function fallbackComparisonPatch(request: ComparisonPatchRequest): ComparisonViewPatch {
  const message = request.message
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
    return { summary: 'Restored hidden columns.', showColumnKeys: cols.map((c) => c.key) }
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
    const target = hideMatch[2].trim()
    const matches = findColumnsByPhrase(cols, target).filter((c) => !isCorePinned(c.key))
    if (matches.length > 0) {
      return { summary: `Hid ${matches.length} column${matches.length === 1 ? '' : 's'} matching "${target}".`, hideColumnKeys: matches.map((m) => m.key) }
    }
  }

  return {
    summary: 'I can preview comparison changes like highlighting lowest eligible prices, fastest lead times, risky/partial rows, hiding empty columns, or restoring hidden columns.',
  }
}

function buildComparisonPatchPrompt(request: ComparisonPatchRequest) {
  return [
    'You are Rialto Agent, controlling a visible construction quote comparison sheet.',
    'Convert the user instruction into a safe preview patch. Do not claim to send emails, award work, create POs, notify vendors, or mutate hidden backend state.',
    'The comparison spec: partial quotes may be shown but must not be crowned as lowest complete; quantity mismatches, no-bids, alternates, and unresolved scope need visible caveats; agent edits are previewed and highlighted for review.',
    'Use only real column keys, line item ids, and rule names from the schema.',
    'Return JSON only with this shape: {"summary":"...","hideColumnKeys":[],"showColumnKeys":[],"hideLineItemIds":[],"showLineItemIds":[],"addHighlights":[{"id":"...","selector":{"kind":"rule","rule":"lowest-price-per-row"},"color":"#bbf7d0","note":"..."}],"removeHighlightIds":[],"clearHighlights":false,"addDerivedColumns":[],"removeDerivedColumnKeys":[]}.',
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
