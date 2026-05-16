import type { ExternalQuoteImportSourceKind } from './external-quote-import'
import { extractExternalQuoteImportText, importSourceKindForFile } from './external-quote-file-text'
import { normalizeUnsupportedExternalQuoteFileWithAgent, type UnsupportedQuoteAgentExtractionInput, type UnsupportedQuoteAgentExtractionResult } from './external-quote-agent-extraction'

export interface ExternalQuoteUploadFile {
  name: string
  type: string
  buffer: Buffer
}

export interface ExternalQuoteFileIngestionResult {
  filename: string
  sourceKind: ExternalQuoteImportSourceKind
  text: string
  warnings: Array<{ message: string }>
  diagnostics: {
    mode: 'normal' | 'agent-forced'
    fallbackReason?: string
    model?: string
  }
}

export interface ExternalQuoteFileIngestionInput {
  file: ExternalQuoteUploadFile
  forceAgent?: boolean
  extractText?: (file: Pick<File, 'name' | 'type'>, buffer: Buffer) => Promise<string>
  normalizeUnsupported?: (input: UnsupportedQuoteAgentExtractionInput) => Promise<UnsupportedQuoteAgentExtractionResult>
}

export async function ingestExternalQuoteFile(input: ExternalQuoteFileIngestionInput): Promise<ExternalQuoteFileIngestionResult> {
  const file = input.file
  const normalizeUnsupported = input.normalizeUnsupported ?? normalizeUnsupportedExternalQuoteFileWithAgent
  const detectedSourceKind = importSourceKindForFile(file)
  const sourceKind = detectedSourceKind ?? 'spreadsheet'

  if (!input.forceAgent) {
    const text = await (input.extractText ?? extractExternalQuoteImportText)(file, file.buffer)
    if (!text.trim()) {
      throw new Error('No readable text or worksheet rows were found.')
    }
    return {
      filename: file.name,
      sourceKind,
      text,
      warnings: [],
      diagnostics: { mode: 'normal' },
    }
  }

  const normalized = await normalizeUnsupported({
    filename: file.name,
    mimeType: file.type,
    buffer: file.buffer,
  })
  return {
    filename: file.name,
    sourceKind: 'spreadsheet',
    text: normalized.text,
    warnings: normalized.warnings.map((message) => ({ message })),
    diagnostics: { mode: 'agent-forced', model: normalized.model },
  }
}
