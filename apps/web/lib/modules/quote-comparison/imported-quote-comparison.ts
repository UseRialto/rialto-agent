import { buildQuoteImportAnalyticsHighlights, buildQuoteImportReviewHighlights, DEFAULT_MAJOR_UNIT_PRICE_DIFFERENCE_PCT } from '../../procurement/comparison-analytics'
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
  sourceUrl?: string
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
    processedFiles: Array<{ filename: string; mode: 'normal' | 'agent-forced'; reason?: string }>
  }
}

function asImportFile(ingested: ExternalQuoteFileIngestionResult, sourceUrl?: string): ExternalQuoteImportFileInput {
  return {
    filename: ingested.filename,
    sourceKind: ingested.sourceKind,
    text: ingested.text,
    sourceUrl,
  }
}

export async function buildImportedQuoteComparison(input: ImportedQuoteComparisonInput): Promise<ImportedQuoteComparisonResult> {
  const ingestFile = input.ingestFile ?? ingestExternalQuoteFile
  const extractedFiles: ExternalQuoteImportFileInput[] = []
  const warnings: Array<{ message: string }> = []
  const processedFiles: ImportedQuoteComparisonResult['diagnostics']['processedFiles'] = []

  for (const file of input.files) {
    const ingested = await ingestFile({
      file,
      forceAgent: file.forceAgent,
    })
    extractedFiles.push(asImportFile(ingested, file.sourceUrl))
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
          sourceUrl: filesToImport[0].sourceUrl,
        })
      : createExternalQuoteImportFromFiles({
          projectId: input.projectId,
          projectName: input.projectName,
          title: input.title?.trim() || input.projectName,
          files: filesToImport,
        })
  )

  const imported = createImport(extractedFiles)

  const importReviewHighlights = buildQuoteImportReviewHighlights(imported.rfq, imported.bids)
  const pricingMistakeHighlights = buildQuoteImportAnalyticsHighlights(imported.rfq, imported.bids)
  const analyticsHighlights = [
    ...importReviewHighlights,
    ...pricingMistakeHighlights,
  ]
  return {
    imported,
    analyticsHighlights,
    warnings: [
      ...imported.warnings,
      ...warnings,
      ...(importReviewHighlights.length > 0 ? [{
        message: `Flagged ${importReviewHighlights.length} importer-normalized price cell${importReviewHighlights.length === 1 ? '' : 's'} in light red for estimator approval.`,
      }] : []),
      ...(pricingMistakeHighlights.length > 0 ? [{
        message: `Flagged ${pricingMistakeHighlights.length} pricing mistake candidate${pricingMistakeHighlights.length === 1 ? '' : 's'} in purple for estimator review using the default ${DEFAULT_MAJOR_UNIT_PRICE_DIFFERENCE_PCT}% unit-price difference threshold.`,
      }] : []),
    ],
    diagnostics: {
      usedAgentFallback: processedFiles.some((file) => file.mode === 'agent-forced'),
      fallbackReasons: processedFiles.flatMap((file) => file.reason ? [`${file.filename}: ${file.reason}`] : []),
      processedFiles,
    },
  }
}
