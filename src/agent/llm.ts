import type { AgentMessage, AgentToolCall, UserContext } from '../domain/types.js'

export interface LlmPlanRequest {
  userContext: UserContext
  messages: AgentMessage[]
  tools: Array<{
    id: string
    productModule?: string
    surface: string
    description: string
    visibleToUser: boolean
    mutatesPersistentData: boolean
    requiresUserApproval: boolean
  }>
}

export interface LlmPlanResponse {
  reply: string
  plan?: string[]
  toolCalls: AgentToolCall[]
}

export interface LlmPlanner {
  plan(request: LlmPlanRequest): Promise<LlmPlanResponse>
}

export function parseJson<T>(text: string): T {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced?.[1]?.trim() ?? trimmed
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('LLM response did not contain JSON.')
  return JSON.parse(raw.slice(start, end + 1)) as T
}

function buildPrompt(request: LlmPlanRequest) {
  const toolsByModule = request.tools.reduce<Record<string, typeof request.tools>>((groups, tool) => {
    const key = tool.productModule ?? 'unassigned'
    groups[key] = [...(groups[key] ?? []), tool]
    return groups
  }, {})
  return [
    'You are Rialto Agent, the single intelligence core for construction procurement.',
    'Choose only from the provided tools. All actions must be visible to the user.',
    'Do not perform post-comparison vendor selection or hidden backend mutations in v1.',
    'Email tools only create drafts; the user sends.',
    'Spreadsheet tools preview changes for review unless a future product policy explicitly allows direct tiny edits.',
    'Return JSON only with shape: {"reply":"...","plan":["..."],"toolCalls":[{"id":"call-1","toolId":"...","input":{}}]}.',
    '',
    `Tools by Product Module: ${JSON.stringify(toolsByModule)}`,
    '',
    `User Context: ${JSON.stringify(request.userContext)}`,
    '',
    'Conversation:',
    ...request.messages.slice(-12).map((message) => `${message.role}: ${message.content}`),
  ].join('\n')
}

export class OpenAIPlanner implements LlmPlanner {
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.OPENAI_MODEL ?? 'gpt-5-mini',
  ) {}

  async plan(request: LlmPlanRequest): Promise<LlmPlanResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: 'Return valid JSON only.' },
          { role: 'user', content: buildPrompt(request) },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 1800,
      }),
    })
    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    if (!response.ok) throw new Error(json.error?.message ?? `OpenAI request failed (${response.status}).`)
    const text = json.choices?.[0]?.message?.content
    if (!text) throw new Error('OpenAI returned an empty response.')
    return parseJson<LlmPlanResponse>(text)
  }
}

type SpreadsheetOperation =
  | { kind: 'set-cell'; rowId: string; columnId: string; value: string | number | boolean | null; provenanceNote?: string }
  | { kind: 'highlight-range'; range: string; color: 'red' | 'orange' | 'blue' | 'green' | 'yellow'; note: string }
  | { kind: 'hide-column'; columnId: string }
  | { kind: 'delete-column'; columnId: string }
  | { kind: 'show-column'; columnId: string }
  | { kind: 'hide-row'; rowId: string }
  | { kind: 'delete-row'; rowId: string }
  | { kind: 'show-row'; rowId: string }
  | { kind: 'insert-column'; columnId: string; label: string; afterColumnId?: string; beforeColumnId?: string }
  | { kind: 'insert-row'; rowId: string; afterRowId?: string; beforeRowId?: string; initialValues?: Record<string, string | number | boolean | null> }
  | { kind: 'rename-sheet'; title: string }
  | { kind: 'rename-column'; columnId: string; label: string }
  | { kind: 'sort-rows'; columnId: string; direction: 'asc' | 'desc' }
  | { kind: 'filter-rows'; columnId: string; predicate: 'non-empty' | 'empty' }
  | { kind: 'add-derived-column'; columnId: string; label: string; formula: string }
  | { kind: 'bulk-adjust-number-column'; columnId: string; amount: number; dependentColumnId?: string; dependentFormula?: 'multiply-by-quantity' }

function cleanTarget(value: string) {
  return value.trim().replace(/\s+(column|columns|row|rows|cell)$/i, '').trim()
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

function operationId(prefix: string) {
  return `${prefix}-${Date.now()}`
}

function spreadsheetOperationsFromInstruction(message: string): SpreadsheetOperation[] {
  const trimmed = normalizeCommandWords(message).trim()
  const lower = trimmed.toLowerCase()

  if (/\b(lowest|complete|quote)\b/.test(lower)) {
    return [{
      kind: 'highlight-range',
      range: 'lowest-complete-comparable-quote',
      color: 'green',
      note: 'Highlight the lowest complete comparable quote; lower partial totals remain separate caveated context.',
    }]
  }

  const clearCellMatch = trimmed.match(/\b(clear|blank|empty)\s+(?:the\s+)?(.+?)\s+cell\s+(?:for|in|on)\s+(.+)$/i)
  if (clearCellMatch) {
    return [{ kind: 'set-cell', columnId: cleanTarget(clearCellMatch[2]), rowId: cleanTarget(clearCellMatch[3]), value: '' }]
  }

  const setCellMatch = trimmed.match(/\b(?:set|change|update)\s+(?:the\s+)?(.+?)\s+(?:cell\s+)?(?:for|in|on)\s+(.+?)\s+(?:to|as)\s+(.+)$/i)
  if (setCellMatch) {
    return [{ kind: 'set-cell', columnId: cleanTarget(setCellMatch[1]), rowId: cleanTarget(setCellMatch[2]), value: setCellMatch[3].trim() }]
  }

  const renameColumnMatch = trimmed.match(/\brename\s+(?:the\s+)?(.+?)\s+column\s+(?:to|as)\s+(.+)$/i)
    ?? trimmed.match(/\brename\s+column\s+(.+?)\s+(?:to|as)\s+(.+)$/i)
  if (renameColumnMatch) {
    return [{ kind: 'rename-column', columnId: cleanTarget(renameColumnMatch[1]), label: renameColumnMatch[2].trim() }]
  }

  const sortMatch = trimmed.match(/\bsort\b\s+(?:by\s+)?(.+?)\s+(ascending|asc|a\s*to\s*z|descending|desc|z\s*to\s*a)\s*$/i)
    ?? trimmed.match(/\bsort\s+(ascending|asc|a\s*to\s*z|descending|desc|z\s*to\s*a)\s+(?:by\s+)?(.+?)\s*$/i)
  if (sortMatch) {
    const firstIsDirection = /^(ascending|asc|a\s*to\s*z|descending|desc|z\s*to\s*a)$/i.test(sortMatch[1])
    const directionText = firstIsDirection ? sortMatch[1] : sortMatch[2]
    const target = firstIsDirection ? sortMatch[2] : sortMatch[1]
    return [{ kind: 'sort-rows', columnId: cleanTarget(target), direction: /\b(desc|descending|z\s*to\s*a)\b/i.test(directionText) ? 'desc' : 'asc' }]
  }

  const filterBlankMatch = trimmed.match(/\b(?:filter|hide)\b[^.]*\bblank(?:s)?\b[^.]*\b(?:in|for|from)\s+(.+?)(?:\s+column)?\s*$/i)
  if (filterBlankMatch) {
    return [{ kind: 'filter-rows', columnId: cleanTarget(filterBlankMatch[1]), predicate: 'empty' }]
  }

  const bulkAddMatch = trimmed.match(/\badd\s+(-?\d+(?:\.\d+)?)\s+(?:to|onto)\s+(?:all\s+)?(?:entries\s+)?(?:in\s+)?(.+?)(?:\s+and\s+(?:then\s+)?update\s+(.+?)(?:\s+according(?:ly)?)?)?\s*$/i)
  if (bulkAddMatch) {
    return [{
      kind: 'bulk-adjust-number-column',
      amount: Number(bulkAddMatch[1]),
      columnId: cleanTarget(bulkAddMatch[2]),
      dependentColumnId: bulkAddMatch[3] ? cleanTarget(bulkAddMatch[3]) : undefined,
      dependentFormula: bulkAddMatch[3] ? 'multiply-by-quantity' : undefined,
    }]
  }

  const insertRowMatch = trimmed.match(/\b(?:add|insert|create)\b[^.]*\brow\b[^.]*\b(above|before|below|after)\s+(.+?)\s*$/i)
    ?? trimmed.match(/\b(?:add|insert|create)\s+(?:a\s+)?row\b/i)
  if (insertRowMatch) {
    const side = insertRowMatch[1]?.toLowerCase()
    const target = insertRowMatch[2] ? cleanTarget(insertRowMatch[2]) : undefined
    return [{
      kind: 'insert-row',
      rowId: operationId('manual-row'),
      ...(target && (side === 'above' || side === 'before') ? { beforeRowId: target } : {}),
      ...(target && side !== 'above' && side !== 'before' ? { afterRowId: target } : {}),
    }]
  }

  const derivedKlfMatch = trimmed.match(/\b(?:add|insert|create)\b[^.]*\bcolumn\b[^.]*\b(?:to\s+)?(right\s+of|after|left\s+of|before)\s+(.+?)(?:,|$)/i)
  if (derivedKlfMatch && /\b(thousand|1000|kilo|k\s*lf|klf)\b/i.test(trimmed) && /\b(linear\s+feet|lf|feet|ft)\b/i.test(trimmed)) {
    const anchor = cleanTarget(derivedKlfMatch[2])
    return [{ kind: 'add-derived-column', columnId: operationId('derived-col'), label: `${anchor} (kLF)`, formula: `divide(column.${anchor},1000)` }]
  }

  const insertColumnMatch = trimmed.match(/\b(?:add|insert|create)\b[^.]*\bcolumn\b[^.]*\b(left\s+of|before|right\s+of|after)\s+(.+?)\s*(?:column)?\s*$/i)
    ?? trimmed.match(/\b(?:add|insert|create)\s+(?:a\s+)?column\b/i)
  if (insertColumnMatch) {
    const side = insertColumnMatch[1]?.toLowerCase()
    const target = insertColumnMatch[2] ? cleanTarget(insertColumnMatch[2]) : undefined
    return [{
      kind: 'insert-column',
      columnId: operationId('manual-col'),
      label: 'New Column',
      ...(target && (side?.includes('left') || side === 'before') ? { beforeColumnId: target } : {}),
      ...(target && !(side?.includes('left') || side === 'before') ? { afterColumnId: target } : {}),
    }]
  }

  const showRowMatch = trimmed.match(/\b(show|unhide|restore|reveal|bring back|put back)\s+(?:the\s+)?(?:row|item|line item)\s+(.+)$/i)
    ?? trimmed.match(/\b(show|unhide|restore|reveal|bring back|put back)\s+(?:the\s+)?(.+?)\s+row\s*$/i)
  if (showRowMatch) return [{ kind: 'show-row', rowId: cleanTarget(showRowMatch[2]) }]

  const hideRowMatch = trimmed.match(/\b(hide|remove|delete|drop)\s+(?:the\s+)?(?:row|item|line item)\s+(.+)$/i)
    ?? trimmed.match(/\b(hide|remove|delete|drop)\s+(?:the\s+)?(.+?)\s+row\s*$/i)
  if (hideRowMatch) {
    const verb = hideRowMatch[1].toLowerCase()
    return [{ kind: verb === 'delete' || verb === 'remove' || verb === 'drop' ? 'delete-row' : 'hide-row', rowId: cleanTarget(hideRowMatch[2]) }]
  }

  const showColumnMatch = trimmed.match(/\b(show|unhide|restore|reveal|bring back|put back)\s+(?:the\s+)?(.+?)\s*(?:column|columns)\s*$/i)
  if (showColumnMatch) return [{ kind: 'show-column', columnId: cleanTarget(showColumnMatch[2]) }]

  const hideColumnMatch = trimmed.match(/\b(hide|remove|delete|drop)\s+(?:the\s+)?(.+?)\s*(?:column|columns)\s*$/i)
  if (hideColumnMatch) {
    const verb = hideColumnMatch[1].toLowerCase()
    return [{ kind: verb === 'delete' || verb === 'remove' || verb === 'drop' ? 'delete-column' : 'hide-column', columnId: cleanTarget(hideColumnMatch[2]) }]
  }

  return []
}

export class DeterministicPlanner implements LlmPlanner {
  async plan(request: LlmPlanRequest): Promise<LlmPlanResponse> {
    const last = request.messages.at(-1)?.content.toLowerCase() ?? ''
    if (/\b(ai|model|llm|api key|openai|running|runtime)\b/.test(last)) {
      return {
        reply: 'NO API KEY',
        plan: [],
        toolCalls: [],
      }
    }
    if (/\b(email|draft|send to vendor|outreach)\b/.test(last)) {
      const quoteRequest = request.userContext.data.quoteRequests[0]
      const vendor = request.userContext.data.vendorDirectory.find((candidate) =>
        last.includes(candidate.name.toLowerCase().split(/\s+/)[0] ?? candidate.name.toLowerCase()),
      ) ?? request.userContext.data.vendorDirectory[0]
      const contact = vendor?.contacts.find((candidate) => !candidate.suppressed) ?? vendor?.contacts[0]
      const subject = quoteRequest ? `Request for Quote: ${quoteRequest.title}` : 'Request for Quote'
      const body = [
        `Hello ${contact?.name?.split(/\s+/)[0] ?? 'there'},`,
        '',
        `${request.userContext.user.name} is requesting pricing for ${quoteRequest?.title ?? 'the attached material package'}.`,
        'Please review the line items and send pricing, lead times, alternates, exclusions, and any quantity or unit notes.',
        '',
        'Thank you,',
        request.userContext.user.name,
      ].join('\n')
      return {
        reply: 'I prepared an email draft for review. You send it when it looks right.',
        plan: ['Open a visible email draft composer.', 'Fill recipients, subject, and body for estimator review.'],
        toolCalls: [{
          id: 'call-email-draft',
          toolId: 'email.draft_vendor_outreach',
          input: {
            quoteRequestId: quoteRequest?.id,
            vendorId: vendor?.id,
            to: contact?.email ? [contact.email] : [],
            subject,
            body,
          },
        }],
      }
    }
    const spreadsheetOperations = spreadsheetOperationsFromInstruction(request.messages.at(-1)?.content ?? '')
    if (spreadsheetOperations.length > 0 || /\b(excel|spreadsheet|comparison|sheet|highlight|column|row)\b/.test(last)) {
      const firstSheet = request.userContext.data.comparisonSheets[0]
      return {
        reply: 'I prepared a spreadsheet edit preview.',
        plan: ['Preview the requested comparison-sheet change before applying it.'],
        toolCalls: [{
          id: 'call-sheet-preview',
          toolId: 'sheet.preview_comparison_patch',
          input: {
            comparisonSheetId: firstSheet?.id ?? 'unknown',
            summary: request.messages.at(-1)?.content ?? 'Spreadsheet edit',
            operations: spreadsheetOperations,
          },
        }],
      }
    }
    if (/\b(go to|open|navigate|show me)\b/.test(last)) {
      return {
        reply: 'I can navigate the app to the relevant page.',
        plan: ['Move the visible app to the requested page.'],
        toolCalls: [{
          id: 'call-navigate',
          toolId: 'site.navigate',
          input: { path: '/quote-requests', reason: 'User asked to navigate or view procurement work.' },
        }],
      }
    }
    return {
      reply: 'NO API KEY',
      plan: [],
      toolCalls: [],
    }
  }
}

export function defaultPlanner(): LlmPlanner {
  if (process.env.OPENAI_API_KEY) return new OpenAIPlanner(process.env.OPENAI_API_KEY)
  return new DeterministicPlanner()
}
