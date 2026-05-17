import type { ContractorRFQLineItem } from '@/lib/types/contractor'

export interface ExternalQuoteSemanticMatchInput {
  importedLineItems: ContractorRFQLineItem[]
  targetLineItems: ContractorRFQLineItem[]
  model?: string
  runModel?: (input: ExternalQuoteSemanticMatchModelInput) => Promise<ExternalQuoteSemanticMatchModelOutput>
}

export interface ExternalQuoteSemanticMatch {
  importedLineItemId: string
  targetLineItemId?: string
  confidence: number
  reviewRequired: boolean
  reason: string
}

export interface ExternalQuoteSemanticMatchModelInput {
  model: string
  importedLineItems: Array<{ id: string; sku: string; description: string; quantity: number; unit: string }>
  targetLineItems: Array<{ id: string; sku: string; description: string; quantity: number; unit: string }>
}

export interface ExternalQuoteSemanticMatchModelOutput {
  matches: ExternalQuoteSemanticMatch[]
}

const MAX_ITEMS_FOR_MODEL = 250

function normalizeUnit(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function rowForModel(item: ContractorRFQLineItem) {
  return {
    id: item.id,
    sku: item.sku ?? '',
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
  }
}

function responseOutputText(json: unknown) {
  if (!json || typeof json !== 'object') return ''
  const direct = (json as { output_text?: unknown }).output_text
  if (typeof direct === 'string') return direct
  const output = (json as { output?: unknown }).output
  if (!Array.isArray(output)) return ''
  return output
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const content = (item as { content?: unknown }).content
      if (!Array.isArray(content)) return []
      return content.flatMap((part) => {
        if (!part || typeof part !== 'object') return []
        const text = (part as { text?: unknown }).text
        return typeof text === 'string' ? [text] : []
      })
    })
    .join('')
}

function parsedModelOutput(text: string): ExternalQuoteSemanticMatchModelOutput {
  const parsed = JSON.parse(text) as Partial<ExternalQuoteSemanticMatchModelOutput>
  const matches = Array.isArray(parsed.matches) ? parsed.matches : []
  return {
    matches: matches.flatMap((match) => {
      if (!match || typeof match !== 'object') return []
      const importedLineItemId = typeof match.importedLineItemId === 'string' ? match.importedLineItemId : ''
      const targetLineItemId = typeof match.targetLineItemId === 'string' && match.targetLineItemId ? match.targetLineItemId : undefined
      const confidence = typeof match.confidence === 'number' && Number.isFinite(match.confidence) ? match.confidence : 0
      const reason = typeof match.reason === 'string' ? match.reason : ''
      if (!importedLineItemId || confidence < 0 || confidence > 1) return []
      return [{
        importedLineItemId,
        targetLineItemId,
        confidence,
        reviewRequired: Boolean(match.reviewRequired),
        reason: reason || 'Model-assisted quote row match.',
      }]
    }),
  }
}

async function runResponsesSemanticMatch(input: ExternalQuoteSemanticMatchModelInput): Promise<ExternalQuoteSemanticMatchModelOutput> {
  if (!process.env.OPENAI_API_KEY) return { matches: [] }
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      store: false,
      reasoning: { effort: 'low' },
      instructions: [
        'You match vendor quote rows to Rialto requested line items.',
        'Return only matches supported by product meaning, not just keyword overlap.',
        'Respect units and quantities. Different wording can match; different size, gauge, material, or unit should require review or no match.',
        'Never invent IDs. Use only the provided IDs.',
      ].join('\n'),
      input: [{
        role: 'user',
        content: JSON.stringify({
          targetLineItems: input.targetLineItems,
          importedLineItems: input.importedLineItems,
        }),
      }],
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'external_quote_semantic_matches',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              matches: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    importedLineItemId: { type: 'string' },
                    targetLineItemId: { type: 'string' },
                    confidence: { type: 'number' },
                    reviewRequired: { type: 'boolean' },
                    reason: { type: 'string' },
                  },
                  required: ['importedLineItemId', 'targetLineItemId', 'confidence', 'reviewRequired', 'reason'],
                  additionalProperties: false,
                },
              },
            },
            required: ['matches'],
            additionalProperties: false,
          },
        },
      },
    }),
  })
  const json = await response.json() as { error?: { message?: string } }
  if (!response.ok) throw new Error(json.error?.message || 'Semantic quote matching request failed.')
  return parsedModelOutput(responseOutputText(json))
}

export async function suggestExternalQuoteSemanticMatches(input: ExternalQuoteSemanticMatchInput): Promise<ExternalQuoteSemanticMatch[]> {
  const importedLineItems = input.importedLineItems
    .filter((item) => item.description || item.sku)
    .slice(0, MAX_ITEMS_FOR_MODEL)
    .map(rowForModel)
  const targetLineItems = input.targetLineItems
    .filter((item) => item.description || item.sku)
    .slice(0, MAX_ITEMS_FOR_MODEL)
    .map(rowForModel)

  if (importedLineItems.length === 0 || targetLineItems.length === 0) return []
  const modelOutput = await (input.runModel ?? runResponsesSemanticMatch)({
    model: input.model ?? process.env.OPENAI_QUOTE_MATCH_MODEL ?? 'gpt-5.4-mini',
    importedLineItems,
    targetLineItems,
  })
  const importedIds = new Set(importedLineItems.map((item) => item.id))
  const targetById = new Map(targetLineItems.map((item) => [item.id, item]))
  return modelOutput.matches.filter((match) => {
    if (!importedIds.has(match.importedLineItemId)) return false
    if (!match.targetLineItemId) return true
    const target = targetById.get(match.targetLineItemId)
    const imported = importedLineItems.find((item) => item.id === match.importedLineItemId)
    if (!target || !imported) return false
    return normalizeUnit(target.unit) === normalizeUnit(imported.unit) || match.reviewRequired
  })
}
