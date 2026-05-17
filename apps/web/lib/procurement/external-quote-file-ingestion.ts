import { createExternalQuoteImport, type ExternalQuoteImportSourceKind } from './external-quote-import'
import { extractExternalQuoteImportText, importSourceKindForFile, isDelimitedSpreadsheetImportFile, isExcelImportFile } from './external-quote-file-text'
import { normalizeUnsupportedExternalQuoteFileWithAgent, type UnsupportedQuoteAgentExtractionInput, type UnsupportedQuoteAgentExtractionResult } from './external-quote-agent-extraction'

export interface ExternalQuoteUploadFile {
  name: string
  type: string
  buffer: Buffer
  sourceUrl?: string
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

function isDirectSpreadsheetImport(file: Pick<File, 'name' | 'type'>) {
  return isDelimitedSpreadsheetImportFile(file) || isExcelImportFile(file)
}

function deterministicImportCanBuildComparison(input: {
  filename: string
  sourceKind: ExternalQuoteImportSourceKind
  text: string
}) {
  try {
    const imported = createExternalQuoteImport({
      projectId: 'import-preflight',
      projectName: 'Import Preflight',
      filename: input.filename,
      sourceKind: input.sourceKind,
      text: input.text,
      now: '2026-01-01T00:00:00.000Z',
    })
    return imported.rfq.line_items.length > 0 && imported.bids.some((bid) => bid.line_item_responses.length > 0)
  } catch {
    return false
  }
}

export async function ingestExternalQuoteFile(input: ExternalQuoteFileIngestionInput): Promise<ExternalQuoteFileIngestionResult> {
  const file = input.file
  const normalizeUnsupported = input.normalizeUnsupported ?? normalizeUnsupportedExternalQuoteFileWithAgent
  const detectedSourceKind = importSourceKindForFile(file)
  const sourceKind = detectedSourceKind ?? 'spreadsheet'
  const shouldUseAgent = input.forceAgent || !isDirectSpreadsheetImport(file)

  if (!shouldUseAgent) {
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

  let sourceText: string | undefined
  try {
    sourceText = await (input.extractText ?? extractExternalQuoteImportText)(file, file.buffer)
  } catch {
    sourceText = undefined
  }
  if (
    !input.forceAgent &&
    sourceText?.trim() &&
    deterministicImportCanBuildComparison({
      filename: file.name,
      sourceKind,
      text: sourceText,
    })
  ) {
    return {
      filename: file.name,
      sourceKind,
      text: sourceText,
      warnings: [],
      diagnostics: { mode: 'normal' },
    }
  }
  const normalized = await normalizeUnsupported({
    filename: file.name,
    mimeType: file.type,
    buffer: file.buffer,
    sourceText,
  })
  return {
    filename: file.name,
    sourceKind: 'spreadsheet',
    text: normalized.text,
    warnings: normalized.warnings.map((message) => ({ message })),
    diagnostics: {
      mode: 'agent-forced',
      model: normalized.model,
      fallbackReason: input.forceAgent
        ? 'Forced through the smart import agent.'
        : 'Non-CSV/Excel quote file normalized through GPT-5.5 before deterministic import.',
    },
  }
}
