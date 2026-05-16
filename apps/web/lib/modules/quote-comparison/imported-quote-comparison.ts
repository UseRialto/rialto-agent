import { buildQuoteImportAnalyticsHighlights, DEFAULT_MAJOR_UNIT_PRICE_DIFFERENCE_PCT } from '../../procurement/comparison-analytics'
import type { ComparisonHighlight } from '../../procurement/comparison-sheet-state'
import {
  createExternalQuoteImport,
  createExternalQuoteImportFromFiles,
  type ExternalQuoteImportFileInput,
  type ExternalQuoteImportResult,
} from '../../procurement/external-quote-import'
import { ingestExternalQuoteFile, type ExternalQuoteFileIngestionResult, type ExternalQuoteUploadFile } from '../../procurement/external-quote-file-ingestion'

export interface QuoteComparisonImportUpload extends ExternalQuoteUploadFile {
  forceAgent?: boolean
}

export interface ImportedQuoteComparisonInput {
  projectId: string
  projectName: string
  title?: string
  files: QuoteComparisonImportUpload[]
  ingestFile?: typeof ingestExternalQuoteFile
}

export interface ImportedQuoteComparisonResult {
  imported: ExternalQuoteImportResult
  analyticsHighlights: ComparisonHighlight[]
  warnings: Array<{ message: string }>
  diagnostics: {
    usedAgentFallback: boolean
    fallbackReasons: string[]
    processedFiles: Array<{ filename: string; mode: 'normal' | 'agent-fallback' | 'agent-forced'; reason?: string }>
  }
}

function asImportFile(ingested: ExternalQuoteFileIngestionResult): ExternalQuoteImportFileInput {
  return {
    filename: ingested.filename,
    sourceKind: ingested.sourceKind,
    text: ingested.text,
  }
}

export async function buildImportedQuoteComparison(input: ImportedQuoteComparisonInput): Promise<ImportedQuoteComparisonResult> {
  const ingestFile = input.ingestFile ?? ingestExternalQuoteFile
  const extractedFiles: ExternalQuoteImportFileInput[] = []
  const warnings: Array<{ message: string }> = []
  const normalUploads: QuoteComparisonImportUpload[] = []
  const processedFiles: ImportedQuoteComparisonResult['diagnostics']['processedFiles'] = []

  for (const file of input.files) {
    if (!file.forceAgent) normalUploads.push(file)
    const ingested = await ingestFile({
      file,
      forceAgent: file.forceAgent,
    })
    extractedFiles.push(asImportFile(ingested))
    warnings.push(...ingested.warnings)
    processedFiles.push({
      filename: file.name,
      mode: ingested.diagnostics.mode,
      reason: ingested.diagnostics.fallbackReason,
    })
  }

  const createImport = (filesToImport: ExternalQuoteImportFileInput[]) => (
    filesToImport.length === 1 && !input.title?.trim()
      ? createExternalQuoteImport({
          projectId: input.projectId,
          projectName: input.projectName,
          filename: filesToImport[0].filename,
          sourceKind: filesToImport[0].sourceKind,
          text: filesToImport[0].text,
        })
      : createExternalQuoteImportFromFiles({
          projectId: input.projectId,
          projectName: input.projectName,
          title: input.title?.trim() || input.projectName,
          files: filesToImport,
        })
  )

  let imported: ExternalQuoteImportResult
  const fallbackReasons: string[] = []
  try {
    imported = createImport(extractedFiles)
  } catch (error) {
    const normalFailureReason = error instanceof Error ? error.message : String(error)
    if (normalUploads.length === 0) throw error
    const repairedFiles = [...extractedFiles]
    for (const file of normalUploads) {
      let repaired: ExternalQuoteFileIngestionResult
      try {
        repaired = await ingestFile({
          file,
          forceAgent: true,
        })
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        throw new Error(`${file.name}: normal import failed (${normalFailureReason}) and smart import fallback also failed (${fallbackMessage}).`)
      }
      const replacement = asImportFile(repaired)
      const index = repairedFiles.findIndex((candidate) => candidate.filename === file.name)
      if (index >= 0) repairedFiles[index] = replacement
      else repairedFiles.push(replacement)
      fallbackReasons.push(`${file.name}: ${normalFailureReason}`)
      const processed = processedFiles.find((entry) => entry.filename === file.name)
      if (processed) {
        processed.mode = 'agent-fallback'
        processed.reason = normalFailureReason
      }
      warnings.push(
        { message: `${file.name}: normal quote parsing failed (${normalFailureReason}); retried with the smart import agent.` },
        ...repaired.warnings,
      )
    }
    try {
      imported = createImport(repairedFiles)
    } catch (fallbackImportError) {
      const fallbackImportMessage = fallbackImportError instanceof Error ? fallbackImportError.message : String(fallbackImportError)
      throw new Error(`Normal quote import failed (${normalFailureReason}); GPT-5.5 fallback ran but still could not create priced quote rows (${fallbackImportMessage}).`)
    }
  }

  const analyticsHighlights = buildQuoteImportAnalyticsHighlights(imported.rfq, imported.bids)
  return {
    imported,
    analyticsHighlights,
    warnings: [
      ...imported.warnings,
      ...warnings,
      ...(analyticsHighlights.length > 0 ? [{
        message: `Flagged ${analyticsHighlights.length} pricing mistake candidate${analyticsHighlights.length === 1 ? '' : 's'} in purple for estimator review using the default ${DEFAULT_MAJOR_UNIT_PRICE_DIFFERENCE_PCT}% unit-price difference threshold.`,
      }] : []),
    ],
    diagnostics: {
      usedAgentFallback: processedFiles.some((file) => file.mode === 'agent-fallback' || file.mode === 'agent-forced'),
      fallbackReasons,
      processedFiles,
    },
  }
}
