import { extractExternalQuoteImportText, importSourceKindForFile } from './external-quote-file-text'

export interface UnsupportedQuoteAgentModelInput {
  model: string
  filename: string
  mimeType: string
  sourceText: string
}

export interface UnsupportedQuoteAgentModelOutput {
  title?: string
  normalizedText: string
  warnings?: string[]
}

export interface UnsupportedQuoteAgentExtractionInput {
  filename: string
  mimeType: string
  buffer: Buffer
  sourceText?: string
  model?: string
  runModel?: (input: UnsupportedQuoteAgentModelInput) => Promise<UnsupportedQuoteAgentModelOutput>
}

export interface UnsupportedQuoteAgentExtractionResult {
  text: string
  warnings: string[]
  model: string
}

const MAX_SOURCE_CHARS = 80_000

function utf8SourceText(buffer: Buffer) {
  return buffer
    .toString('utf8')
    .replace(/\u0000/g, '')
    .slice(0, MAX_SOURCE_CHARS)
}

async function readableSourceText(input: UnsupportedQuoteAgentExtractionInput) {
  if (input.sourceText?.trim()) return input.sourceText.slice(0, MAX_SOURCE_CHARS)
  if (importSourceKindForFile({ name: input.filename, type: input.mimeType })) {
    return (await extractExternalQuoteImportText(
      { name: input.filename, type: input.mimeType },
      input.buffer,
    )).slice(0, MAX_SOURCE_CHARS)
  }
  return utf8SourceText(input.buffer)
}

function normalizeModelText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .join('\n')
}

function parseOutputText(text: string): UnsupportedQuoteAgentModelOutput {
  const parsed = JSON.parse(text) as Partial<UnsupportedQuoteAgentModelOutput>
  if (!parsed.normalizedText || typeof parsed.normalizedText !== 'string') {
    throw new Error('The import agent did not return normalized quote table text.')
  }
  return {
    title: typeof parsed.title === 'string' ? parsed.title : undefined,
    normalizedText: parsed.normalizedText,
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0)
      : [],
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

async function runResponsesImportAgent(input: UnsupportedQuoteAgentModelInput): Promise<UnsupportedQuoteAgentModelOutput> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Unsupported file import requires OPENAI_API_KEY.')
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      store: false,
      instructions: [
        'You are Rialto Agent\'s unsupported quote-file import normalizer.',
        'Extract vendor quote comparison data from the source file text and return a TSV-style table.',
        'Use headers the deterministic importer understands: Item, SKU, Description, Qty, Unit, and repeated vendor metric columns such as "<Vendor> Unit Price", "<Vendor> Total", "<Vendor> Lead Time", "<Vendor> Notes".',
        'Preserve notes such as alternate manufacturer or substitution as notes only. Do not invent explicit alternate flags.',
        'Return only facts present in the file. Omit rows or prices you cannot read.',
      ].join('\n'),
      input: [
        {
          role: 'user',
          content: [
            `Filename: ${input.filename}`,
            `MIME type: ${input.mimeType || 'unknown'}`,
            'Source text:',
            input.sourceText,
          ].join('\n\n'),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'unsupported_quote_import_normalization',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              normalizedText: { type: 'string' },
              warnings: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['title', 'normalizedText', 'warnings'],
            additionalProperties: false,
          },
        },
      },
    }),
  })

  const json = await response.json() as { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(json.error?.message || 'Unsupported file import agent request failed.')
  }
  const outputText = responseOutputText(json)
  if (!outputText) throw new Error('Unsupported file import agent returned no text.')
  return parseOutputText(outputText)
}

export async function normalizeUnsupportedExternalQuoteFileWithAgent(input: UnsupportedQuoteAgentExtractionInput): Promise<UnsupportedQuoteAgentExtractionResult> {
  const model = input.model ?? process.env.OPENAI_UNSUPPORTED_IMPORT_MODEL ?? 'gpt-5.5'
  const sourceText = await readableSourceText(input)
  if (!sourceText.trim()) {
    throw new Error(`No readable text was found in ${input.filename}.`)
  }

  const output = await (input.runModel ?? runResponsesImportAgent)({
    model,
    filename: input.filename,
    mimeType: input.mimeType,
    sourceText,
  })
  const text = normalizeModelText(output.normalizedText)
  if (!text) throw new Error(`The import agent could not normalize ${input.filename} into quote comparison rows.`)

  return {
    text,
    warnings: [
      `Used ${model} to normalize unsupported file ${input.filename}. Review extracted rows before relying on totals.`,
      ...(output.warnings ?? []),
    ],
    model,
  }
}
