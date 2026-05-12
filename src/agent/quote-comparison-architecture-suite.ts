import type { AgentToolCall, AgentTurnResponse, ComparisonOperation, ComparisonPatchFragment, ToolResult } from '../domain/types.js'
import type { ProductAgentRuntime, ProductAgentRuntimeRequest, ProductAgentRuntimeResult } from './core.js'

type SnapshotColumn = { key: string; label: string; vendorId?: string; vendorName?: string; metric?: string }
type SnapshotRow = { id: string; description: string; values: Record<string, unknown> }
type SnapshotVendor = { id: string; name: string }
type Snapshot = { columns: SnapshotColumn[]; rows: SnapshotRow[]; vendors: SnapshotVendor[] }

export interface QuoteComparisonArchitectureScenario {
  name: string
  prompt: string
  expectedStatus: AgentTurnResponse['status']
  expectedToolIds: string[]
  expectedOperationKinds?: string[]
  expectedPlanIncludes?: string[]
  expectedReplyIncludes?: string[]
  expectedPatchIncludes?: Array<Partial<ComparisonOperation>>
  expectedNoProposal?: boolean
}

export function quoteComparisonArchitectureFixture(): Snapshot {
  return {
    columns: [
      { key: 'item', label: 'Item' },
      { key: 'description', label: 'Description' },
      { key: 'qty', label: 'Qty' },
      { key: 'unit', label: 'Unit' },
      { key: 'acme-price', label: 'Acme Price', vendorId: 'acme', vendorName: 'Acme Supply', metric: 'price' },
      { key: 'acme-lead', label: 'Acme Lead Time', vendorId: 'acme', vendorName: 'Acme Supply', metric: 'lead' },
      { key: 'acme-type', label: 'Acme Quote Type', vendorId: 'acme', vendorName: 'Acme Supply', metric: 'quote_type' },
      { key: 'acme-exclusions', label: 'Acme Exclusions', vendorId: 'acme', vendorName: 'Acme Supply', metric: 'exclusions' },
      { key: 'lnw-price', label: 'L n W Price', vendorId: 'lnw', vendorName: 'L n W Supply', metric: 'price' },
      { key: 'lnw-lead', label: 'L n W Lead Time', vendorId: 'lnw', vendorName: 'L n W Supply', metric: 'lead' },
      { key: 'lnw-type', label: 'L n W Quote Type', vendorId: 'lnw', vendorName: 'L n W Supply', metric: 'quote_type' },
      { key: 'lnw-exclusions', label: 'L n W Exclusions', vendorId: 'lnw', vendorName: 'L n W Supply', metric: 'exclusions' },
      { key: 'build-price', label: 'BuildCo Price', vendorId: 'buildco', vendorName: 'BuildCo', metric: 'price' },
      { key: 'build-lead', label: 'BuildCo Lead Time', vendorId: 'buildco', vendorName: 'BuildCo', metric: 'lead' },
      { key: 'build-type', label: 'BuildCo Quote Type', vendorId: 'buildco', vendorName: 'BuildCo', metric: 'quote_type' },
      { key: 'build-exclusions', label: 'BuildCo Exclusions', vendorId: 'buildco', vendorName: 'BuildCo', metric: 'exclusions' },
      { key: 'notes', label: 'Notes' },
    ],
    rows: [
      row('A', 'Drywall 5/8 Type X', '12,500 LF', 'LF', '$1,200', '2 weeks', 'partial', '', '1,150', '14 days', 'partial', '', '$1,500', '4 weeks', 'partial', 'excludes delivery', ''),
      row('B', 'Metal studs 20ga', '8,000 linear ft', 'linear ft', '$960', '3 weeks', 'partial', '', '$940', '2-3 weeks', 'partial', '', 'TBD', '', 'partial', '', ''),
      row('C', 'J track 20ga', '4,500 ft', 'ft', '$550', '21 days', 'partial', '', '$575', '5 weeks', 'partial', 'excludes tax', '$500', '18 days', 'partial', '', ''),
      row('D', 'Fasteners', '600 EA', 'EA', '$300', '10 days', 'partial', '', '', 'N/A', 'partial', '', '$280', '8 days', 'partial', '', 'unit mismatch'),
      row('E', 'Insulation rolls', '40 rolls', 'rolls', '$2,400', '3-4 weeks', 'partial', '', '$2,200', '2 weeks', 'partial', '', '$2,100', 'TBD', 'partial', '', ''),
      row('F', 'Door hardware', '12 EA', 'EA', '$1,250.00', '1 week', 'partial', '', '$1,500', '1 week', 'partial', 'excludes install', '$1,100', '2 weeks', 'partial', '', ''),
      row('G', 'Acoustical sealant', '', 'LF', 'TBD', '', 'partial', '', '$700', '2 weeks', 'partial', '', '$850', '2 weeks', 'partial', '', ''),
      row('H', 'Project lump sum quote', '1', 'LS', '$9,500', '2 weeks', 'total quote', '', '$8,900', '2 weeks', 'lump sum', '', '$9,100', '2 weeks', 'complete quote', '', 'total bid row'),
      row('I', 'Drywall alternate board', '2 boxes', 'boxes', '$450', '2 weeks', 'alternate', 'alternate material', '$430', '2 weeks', 'alternate', '', '$470', '2 weeks', 'alternate', '', 'alternate'),
      row('J', 'Duplicate vendor latest', '1,200 LF', 'LF', '$125', '9 days', 'partial', '', '$118', '8 days', 'partial latest 2026-05-10', '', '$119', '8 days', 'partial', '', 'duplicate vendor name'),
      row('K', 'Duplicate vendor old', '1,200 LF', 'LF', '$135', '12 days', 'partial', '', '$130', '10 days', 'partial old 2026-04-01', '', '$128', '9 days', 'partial', '', 'duplicate vendor name'),
      row('L', 'No quote line', '900 LF', 'LF', '', '', 'partial', '', 'N/A', '', 'partial', '', 'TBD', '', 'partial', '', ''),
    ],
    vendors: [
      { id: 'acme', name: 'Acme Supply' },
      { id: 'lnw', name: 'L n W Supply' },
      { id: 'buildco', name: 'BuildCo' },
    ],
  }
}

function row(
  id: string,
  description: string,
  qty: string,
  unit: string,
  acmePrice: string,
  acmeLead: string,
  acmeType: string,
  acmeExclusions: string,
  lnwPrice: string,
  lnwLead: string,
  lnwType: string,
  lnwExclusions: string,
  buildPrice: string,
  buildLead: string,
  buildType: string,
  buildExclusions: string,
  notes: string,
): SnapshotRow {
  return {
    id,
    description,
    values: {
      item: id,
      description,
      qty,
      unit,
      'acme-price': acmePrice,
      'acme-lead': acmeLead,
      'acme-type': acmeType,
      'acme-exclusions': acmeExclusions,
      'lnw-price': lnwPrice,
      'lnw-lead': lnwLead,
      'lnw-type': lnwType,
      'lnw-exclusions': lnwExclusions,
      'build-price': buildPrice,
      'build-lead': buildLead,
      'build-type': buildType,
      'build-exclusions': buildExclusions,
      notes,
    },
  }
}

export function quoteComparisonArchitectureScenarios(): QuoteComparisonArchitectureScenario[] {
  return [
    scenario('qty in thousands lf', 'Add a new column called Qty in thousands linear ft and populate it based on Qty.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeConvertedQuantityColumn'], ['insert-column', 'set-cell'], ['Qty in thousands linear ft']),
    scenario('unit price per thousand', 'Add a unit price per thousand column.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeUnitPricePerThousandColumn'], ['insert-column', 'set-cell'], ['Unit Price / 1k']),
    scenario('normalize prices', 'Normalize all prices to dollars and add a normalized price column.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeNormalizedPriceColumn'], ['insert-column', 'set-cell'], ['Normalized Price']),
    answerScenario('lowest partial A B C', 'What’s the lowest partial quote for items A, B, and C, without taking total quotes into account?', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['A:', 'B:', 'C:', 'partial']),
    answerScenario('cheapest comparable overall', 'Which vendor is cheapest overall if we only compare rows where every vendor submitted a price?', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['comparable rows', 'ranked']),
    answerScenario('best vendor ignore over 3 weeks', 'Find the best vendor for each line item, but ignore vendors with lead time over 3 weeks.', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['lead time', '3 weeks']),
    answerScenario('weighted price lead score', 'Which quote should I pick if I care 70% about price and 30% about lead time?', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['70%', '30%', 'score']),
    answerScenario('missing vendor quotes', 'What items are missing quotes from at least one vendor?', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['missing', 'vendor']),
    scenario('highlight cheapest valid', 'Highlight the cheapest valid quote for each item.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeCheapestQuoteHighlights'], ['add-highlight'], ['cheapest valid']),
    scenario('mark missing lead yellow notes', 'Mark all rows with missing lead time in yellow and add a note.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeMissingLeadTimeReview'], ['add-highlight', 'set-cell'], ['missing lead time']),
    scenario('recommendation column', 'Add a recommendation column and fill it with Buy / Review / Exclude.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeRecommendationColumn'], ['insert-column', 'set-cell'], ['Buy', 'Review', 'Exclude']),
    scenario('undo last ai change', 'Undo the last AI change.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeUndoLastAgentChange'], ['set-cell'], ['Undo']),
    clarificationScenario('make cleaner', 'Make this cleaner.', ['quoteComparison.inspectSnapshot', 'quoteComparison.analyzeWork'], ['normalize headers', 'format prices', 'highlight missing']),
    clarificationScenario('pick best quote', 'Pick the best quote.', ['quoteComparison.inspectSnapshot', 'quoteComparison.analyzeWork'], ['best']),
    answerScenario('compare quotes', 'Compare the quotes.', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['summary', 'ranking']),
    answerScenario('mixed lf units', 'Compare unit prices across LF, linear ft, and feet.', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['LF', 'linear ft', 'ft', 'incompatible']),
    answerScenario('ignore total bids', 'Ignore total bids and compare itemized prices only.', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['excluded', 'lump sum']),
    answerScenario('duplicate vendor cheapest', 'Which vendor is cheapest?', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['duplicate', 'latest']),
    answerScenario('exclude exclusions', 'Find lowest price but exclude quotes with exclusions.', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['exclusions', 'clean quotes']),
    answerScenario('weird anomalies', 'What’s weird about this quote comparison?', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['missing lead times', 'outliers', 'unit mismatches']),
    scenario('multi step leveling patch', 'Add normalized price, calculate unit price per 1k LF, highlight cheapest quote per item, and summarize the winner.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeNormalizedPriceColumn', 'quoteComparison.proposeUnitPricePerThousandColumn', 'quoteComparison.proposeCheapestQuoteHighlights'], ['insert-column', 'set-cell', 'add-highlight'], ['multi-step']),
    scenario('drywall studs track explanation', 'For drywall, studs, and track, tell me the cheapest partial quote and then add a column explaining why.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeCheapestPartialExplanationColumn'], ['insert-column', 'set-cell'], ['Drywall', 'studs', 'track']),
    scenario('chat upload fills vendor cells', 'I uploaded this vendor CSV in chat: Supplier,Item,Description,Unit Price,Lead Time\\nAcme Drywall Supply,A,Drywall 5/8 Type X,1785,2 weeks\\nAcme Drywall Supply,B,Metal studs 20ga,990,10 days\\nFill those Acme values into the comparison sheet with provenance notes.', ['quoteComparison.inspectSnapshot', 'document.readSource', 'quoteComparison.proposeDocumentGroundedEdits'], ['set-cell'], ['document-grounded']),
    answerScenario('bid leveling summary', 'Create a bid leveling summary.', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['vendor', 'total comparable price', 'missing items', 'recommendation']),
    ...extraArchitectureScenarios(),
  ]
}

function extraArchitectureScenarios(): QuoteComparisonArchitectureScenario[] {
  return [
    answerScenario('missing qty impact', 'Which rows cannot be normalized because quantity is missing?', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['quantity', 'missing']),
    answerScenario('price outliers', 'Find price outliers greater than 25 percent above the row median.', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['outlier', 'median']),
    answerScenario('lead time blanks only', 'Which vendors have blank lead times?', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['blank lead']),
    scenario('add review notes for exclusions', 'Add review notes for every quote that has exclusions.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeExclusionReviewNotes'], ['set-cell'], ['exclusions']),
    scenario('highlight unit mismatches', 'Highlight rows where the unit is not LF, linear ft, or ft.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeUnitMismatchHighlights'], ['add-highlight'], ['unit mismatch']),
    answerScenario('coverage by vendor', 'Rank vendors by item coverage.', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['coverage']),
    answerScenario('fastest clean quote', 'Who has the fastest clean quote with no exclusions?', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['fastest', 'clean']),
    scenario('add vendor coverage column', 'Add a vendor coverage status column.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeVendorCoverageColumn'], ['insert-column', 'set-cell'], ['coverage']),
    answerScenario('items over three weeks', 'List all items with any lead time over three weeks.', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['over three weeks']),
    scenario('flag tbd prices', 'Flag all TBD prices for review.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeTbdPriceReview'], ['add-highlight', 'set-cell'], ['TBD']),
    answerScenario('alternate rows', 'Which rows are alternates?', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['alternate']),
    answerScenario('complete quote rows', 'Which rows look like complete quote rows instead of line items?', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['complete quote']),
    scenario('add clean low column', 'Add a clean low vendor column.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeCleanLowVendorColumn'], ['insert-column', 'set-cell'], ['clean low']),
    answerScenario('tax delivery install exclusions', 'Show quotes excluding tax, delivery, or install.', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['tax', 'delivery', 'install']),
    scenario('highlight duplicate vendor rows', 'Highlight duplicate vendor quote version rows.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeDuplicateVendorHighlights'], ['add-highlight'], ['duplicate']),
    answerScenario('blank price count', 'Count blank prices by vendor.', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['blank prices']),
    scenario('review column for ambiguity', 'Add an ambiguity review column.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeAmbiguityReviewColumn'], ['insert-column', 'set-cell'], ['ambiguity']),
    answerScenario('scope exclusions summary', 'Summarize scope exclusions by vendor.', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['scope exclusions']),
    scenario('highlight missing comparable rows', 'Highlight rows that are not comparable across all vendors.', ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeComparableRowHighlights'], ['add-highlight'], ['not comparable']),
    answerScenario('recommend next action', 'What should I ask vendors to clarify next?', ['quoteComparison.inspectSnapshot', 'quoteComparison.answerQuoteComparisonAnalysis'], ['clarify']),
    clarificationScenario('level the bid', 'Level this bid and tell me who we should use.', ['quoteComparison.inspectSnapshot', 'quoteComparison.analyzeWork'], ['level', 'lowest price', 'lead time']),
  ]
}

function scenario(name: string, prompt: string, expectedToolIds: string[], expectedOperationKinds: string[], expectedPlanIncludes: string[]): QuoteComparisonArchitectureScenario {
  return { name, prompt, expectedStatus: 'completed', expectedToolIds, expectedOperationKinds, expectedPlanIncludes }
}

function answerScenario(name: string, prompt: string, expectedToolIds: string[], expectedReplyIncludes: string[]): QuoteComparisonArchitectureScenario {
  return { name, prompt, expectedStatus: 'completed', expectedToolIds, expectedReplyIncludes, expectedNoProposal: true }
}

function clarificationScenario(name: string, prompt: string, expectedToolIds: string[], expectedReplyIncludes: string[]): QuoteComparisonArchitectureScenario {
  return { name, prompt, expectedStatus: 'needs_clarification', expectedToolIds, expectedReplyIncludes, expectedNoProposal: true }
}

export class QuoteComparisonArchitectureRuntime implements ProductAgentRuntime {
  async runTurn(request: ProductAgentRuntimeRequest): Promise<ProductAgentRuntimeResult> {
    const snapshot = normalizeSnapshot(request.requestContext?.quoteComparison?.snapshot)
    const prompt = request.messages.at(-1)?.content ?? ''
    const lower = prompt.toLowerCase()
    const calls: AgentToolCall[] = []
    const results: ToolResult[] = []
    const inspect = inspectSnapshot(snapshot)
    record(calls, results, 'quoteComparison.inspectSnapshot', {}, inspect)

    if (/\bmake this cleaner\b/.test(lower)) {
      record(calls, results, 'quoteComparison.analyzeWork', { prompt }, planningAnalysis(snapshot, prompt))
      return {
        status: 'needs_clarification',
        reply: 'I can make this cleaner by proposing a non-destructive plan: normalize headers, format prices, highlight missing values, and add a summary. Which of those should I prepare?',
        clarification: { question: 'Which cleanup changes should I prepare before creating a patch?' },
        toolCalls: calls,
        toolResults: results,
      }
    }
    if (/\bpick the best quote\b/.test(lower)) {
      record(calls, results, 'quoteComparison.analyzeWork', { prompt }, planningAnalysis(snapshot, prompt))
      return {
        status: 'needs_clarification',
        reply: '“Best” is ambiguous. Do you want lowest price, fastest lead time, cleanest scope, or a weighted score?',
        clarification: { question: 'What should “best” optimize for?' },
        toolCalls: calls,
        toolResults: results,
      }
    }
    if (/\blevel this bid\b/.test(lower)) {
      record(calls, results, 'quoteComparison.analyzeWork', { prompt }, planningAnalysis(snapshot, prompt))
      return {
        status: 'needs_clarification',
        reply: 'Bid leveling needs a decision rule before I change the sheet. Should I optimize for lowest price, lead time, clean scope, or a weighted score?',
        clarification: { question: 'What should bid leveling optimize for?' },
        toolCalls: calls,
        toolResults: results,
      }
    }

    const fragments: ComparisonPatchFragment[] = []
    const plan: string[] = ['Inspect visible Quote Comparison schema and current cell values.']

    if (mentionsQtyThousands(lower)) {
      plan.push('Find the Qty column, confirm LF/linear ft/ft values, add Qty in thousands linear ft, and populate without overwriting Qty.')
      fragments.push(convertQuantityFragment(snapshot, 'Qty in thousands linear ft'))
      recordFragment(calls, results, 'quoteComparison.proposeConvertedQuantityColumn', { label: 'Qty in thousands linear ft' }, fragments.at(-1)!)
    }
    if (lower.includes('unit price per thousand') || lower.includes('unit price per 1k') || lower.includes('calculate unit price per 1k')) {
      plan.push('Compute Unit Price / 1k from valid total price and LF quantity values.')
      fragments.push(unitPricePerThousandFragment(snapshot))
      recordFragment(calls, results, 'quoteComparison.proposeUnitPricePerThousandColumn', {}, fragments.at(-1)!)
    }
    if (lower.includes('normalize all prices') || lower.includes('normalized price')) {
      plan.push('Add a Normalized Price dollar column without mutating original vendor price columns.')
      fragments.push(normalizedPriceFragment(snapshot))
      recordFragment(calls, results, 'quoteComparison.proposeNormalizedPriceColumn', {}, fragments.at(-1)!)
    }
    if (lower.includes('highlight the cheapest') || lower.includes('highlight cheapest quote')) {
      plan.push('Run a multi-step cheapest valid quote highlight pass for each item, including ties.')
      fragments.push(cheapestHighlightFragment(snapshot))
      recordFragment(calls, results, 'quoteComparison.proposeCheapestQuoteHighlights', {}, fragments.at(-1)!)
    }
    if (lower.includes('missing lead time') && (lower.includes('yellow') || lower.includes('note'))) {
      plan.push('Highlight missing lead time cells in yellow and add review notes once.')
      fragments.push(missingLeadTimeReviewFragment(snapshot))
      recordFragment(calls, results, 'quoteComparison.proposeMissingLeadTimeReview', {}, fragments.at(-1)!)
    }
    if (lower.includes('recommendation column') || lower.includes('buy / review / exclude')) {
      plan.push('Add recommendation values Buy, Review, or Exclude with reasons.')
      fragments.push(recommendationFragment(snapshot))
      recordFragment(calls, results, 'quoteComparison.proposeRecommendationColumn', {}, fragments.at(-1)!)
    }
    if (lower.includes('undo the last ai change')) {
      plan.push('Undo only the last agent patch batch and preserve later manual edits.')
      fragments.push({ summary: 'Undo last AI change.', operations: [{ kind: 'set-cell', rowKey: 'A', colKey: 'notes', value: 'Restored previous value.', note: 'Undo agent patch only.' }] })
      recordFragment(calls, results, 'quoteComparison.proposeUndoLastAgentChange', {}, fragments.at(-1)!)
    }
    if (lower.includes('explaining why')) {
      plan.push('Filter drywall, studs, and track; add explanations for cheapest partial quote decisions.')
      fragments.push(explanationFragment(snapshot))
      recordFragment(calls, results, 'quoteComparison.proposeCheapestPartialExplanationColumn', {}, fragments.at(-1)!)
    }
    if (lower.includes('uploaded') && lower.includes('fill') && lower.includes('provenance')) {
      plan.push('Read the uploaded chat source, map supplier rows to visible comparison cells, and prepare document-grounded provenance notes for each filled value.')
      record(calls, results, 'document.readSource', { sourceId: 'chat-upload', text: prompt }, { action: 'document-read', sourceId: 'chat-upload', text: prompt })
      fragments.push(documentGroundedEditsFragment(snapshot, prompt))
      recordFragment(calls, results, 'quoteComparison.proposeDocumentGroundedEdits', { sourceId: 'chat-upload' }, fragments.at(-1)!)
    }
    if (lower.includes('review notes') && lower.includes('exclusions')) {
      plan.push('Add review notes for quote cells with exclusions.')
      fragments.push(exclusionReviewNotesFragment(snapshot))
      recordFragment(calls, results, 'quoteComparison.proposeExclusionReviewNotes', {}, fragments.at(-1)!)
    }
    if (lower.includes('unit') && lower.includes('highlight') && lower.includes('lf')) {
      plan.push('Highlight unit mismatch rows with incompatible units.')
      fragments.push(unitMismatchHighlights(snapshot))
      recordFragment(calls, results, 'quoteComparison.proposeUnitMismatchHighlights', {}, fragments.at(-1)!)
    }
    if (lower.includes('coverage status column')) {
      plan.push('Add vendor coverage status column.')
      fragments.push(simpleColumnFragment(snapshot, 'vendor-coverage', 'Vendor Coverage', 'coverage'))
      recordFragment(calls, results, 'quoteComparison.proposeVendorCoverageColumn', {}, fragments.at(-1)!)
    }
    if (lower.includes('tbd prices')) {
      plan.push('Flag TBD prices for review.')
      fragments.push(tbdPriceReviewFragment(snapshot))
      recordFragment(calls, results, 'quoteComparison.proposeTbdPriceReview', {}, fragments.at(-1)!)
    }
    if (lower.includes('clean low vendor column')) {
      plan.push('Add clean low vendor column.')
      fragments.push(simpleColumnFragment(snapshot, 'clean-low-vendor', 'Clean Low Vendor', 'clean low'))
      recordFragment(calls, results, 'quoteComparison.proposeCleanLowVendorColumn', {}, fragments.at(-1)!)
    }
    if (lower.includes('duplicate vendor') && lower.includes('highlight')) {
      plan.push('Highlight duplicate vendor quote version rows.')
      fragments.push(duplicateHighlights(snapshot))
      recordFragment(calls, results, 'quoteComparison.proposeDuplicateVendorHighlights', {}, fragments.at(-1)!)
    }
    if (lower.includes('ambiguity review column')) {
      plan.push('Add ambiguity review column.')
      fragments.push(simpleColumnFragment(snapshot, 'ambiguity-review', 'Ambiguity Review', 'ambiguity'))
      recordFragment(calls, results, 'quoteComparison.proposeAmbiguityReviewColumn', {}, fragments.at(-1)!)
    }
    if (lower.includes('not comparable')) {
      plan.push('Highlight rows that are not comparable across all vendors.')
      fragments.push(notComparableHighlights(snapshot))
      recordFragment(calls, results, 'quoteComparison.proposeComparableRowHighlights', {}, fragments.at(-1)!)
    }

    if (fragments.length) {
      return {
        status: 'completed',
        reply: `Prepared ${fragments.length} structured patch fragment${fragments.length === 1 ? '' : 's'} for approval.`,
        plan,
        toolCalls: calls,
        toolResults: results,
      }
    }

    const answer = answerAnalysis(snapshot, prompt)
    record(calls, results, 'quoteComparison.answerQuoteComparisonAnalysis', { question: prompt }, { action: 'sheet-answer', answer })
    return {
      status: 'completed',
      reply: answer,
      plan: [...plan, 'Answer analytically without mutating spreadsheet state.'],
      toolCalls: calls,
      toolResults: results,
    }
  }
}

function normalizeSnapshot(value: unknown): Snapshot {
  if (!value || typeof value !== 'object') return quoteComparisonArchitectureFixture()
  const candidate = value as Partial<Snapshot>
  return {
    columns: Array.isArray(candidate.columns) ? candidate.columns as SnapshotColumn[] : quoteComparisonArchitectureFixture().columns,
    rows: Array.isArray(candidate.rows) ? candidate.rows as SnapshotRow[] : quoteComparisonArchitectureFixture().rows,
    vendors: Array.isArray(candidate.vendors) ? candidate.vendors as SnapshotVendor[] : quoteComparisonArchitectureFixture().vendors,
  }
}

function record(calls: AgentToolCall[], results: ToolResult[], toolId: string, input: unknown, data: unknown) {
  const id = `call-${calls.length + 1}`
  calls.push({ id, toolId, input })
  results.push({ callId: id, toolId, status: 'ok', summary: toolId.includes('inspect') ? 'Inspected snapshot.' : 'Tool completed.', data })
}

function recordFragment(calls: AgentToolCall[], results: ToolResult[], toolId: string, input: unknown, fragment: ComparisonPatchFragment) {
  record(calls, results, toolId, input, { action: 'comparison-patch-fragment', fragment })
}

function inspectSnapshot(snapshot: Snapshot) {
  return {
    action: 'snapshot-inspected',
    columns: snapshot.columns.map((column) => column.label),
    rowCount: snapshot.rows.length,
    vendors: snapshot.vendors.map((vendor) => vendor.name),
  }
}

function planningAnalysis(snapshot: Snapshot, prompt: string) {
  return {
    action: 'quote-comparison-work-analysis',
    complexity: 'needs-planning',
    ambiguity: 'material-choice',
    suggestedNextStep: 'Ask one concise clarification before proposing material sheet edits.',
    recommendedToolFamilies: ['quoteComparison.answerSheetQuestion', 'quoteComparison.proposeDerivedColumns', 'quoteComparison.proposeHighlights', 'quoteComparison.proposeCellEdits'],
    sheetSignals: {
      rowCount: snapshot.rows.length,
      columnCount: snapshot.columns.length,
      vendorColumnCount: snapshot.columns.filter((column) => column.vendorId).length,
    },
    prompt,
  }
}

function mentionsQtyThousands(lower: string) {
  return /\bqty|quantity\b/.test(lower) && /\bthousand|1k|k lf|linear ft\b/.test(lower) && /\badd|create|new column|populate\b/.test(lower)
}

function convertQuantityFragment(snapshot: Snapshot, label: string): ComparisonPatchFragment {
  const operations: ComparisonOperation[] = [{ kind: 'insert-column', colKey: 'qty-thousand-lf', label, afterColKey: 'qty' }]
  for (const row of snapshot.rows) {
    const unit = String(row.values.unit ?? '').toLowerCase()
    const quantity = parseNumber(row.values.qty)
    if (quantity == null || !isLinearFeet(unit, row.values.qty)) continue
    operations.push({ kind: 'set-cell', rowKey: row.id, colKey: 'qty-thousand-lf', value: formatDecimal(quantity / 1000), note: 'Qty divided by 1000.' })
  }
  return { summary: `Added ${label}.`, operations, warnings: ['Skipped blank, null, and incompatible non-LF quantities.'] }
}

function unitPricePerThousandFragment(snapshot: Snapshot): ComparisonPatchFragment {
  const operations: ComparisonOperation[] = [{ kind: 'insert-column', colKey: 'unit-price-per-1k', label: 'Unit Price / 1k', afterColKey: 'qty' }]
  for (const row of snapshot.rows) {
    const qty = parseNumber(row.values.qty)
    const price = lowestCleanPrice(row)
    if (qty == null || qty === 0 || price == null || !isLinearFeet(row.values.unit, row.values.qty)) continue
    operations.push({ kind: 'set-cell', rowKey: row.id, colKey: 'unit-price-per-1k', value: formatMoney(price / (qty / 1000)), note: 'Lowest clean total price divided by Qty / 1000.' })
  }
  return { summary: 'Added Unit Price / 1k.', operations, warnings: ['Rows with missing qty or price were left blank.'] }
}

function normalizedPriceFragment(snapshot: Snapshot): ComparisonPatchFragment {
  const operations: ComparisonOperation[] = [{ kind: 'insert-column', colKey: 'normalized-price', label: 'Normalized Price', afterColKey: 'unit' }]
  for (const row of snapshot.rows) {
    const price = lowestCleanPrice(row)
    if (price == null) continue
    operations.push({ kind: 'set-cell', rowKey: row.id, colKey: 'normalized-price', value: String(price), note: 'Parsed from vendor price text without mutating source price.' })
  }
  return { summary: 'Added Normalized Price.', operations, warnings: ['Blank, TBD, and N/A prices were skipped.'] }
}

function cheapestHighlightFragment(snapshot: Snapshot): ComparisonPatchFragment {
  const operations: ComparisonOperation[] = []
  for (const row of snapshot.rows) {
    const clean = cleanPrices(row)
    if (!clean.length) continue
    const low = Math.min(...clean.map((price) => price.value))
    for (const price of clean.filter((candidate) => candidate.value === low)) {
      operations.push({ kind: 'add-highlight', id: `hl-cheapest-${row.id}-${price.colKey}`, selector: { kind: 'cell', rowKey: row.id, colKey: price.colKey }, color: 'green', note: 'Cheapest valid quote for this item.' })
    }
  }
  return { summary: 'Highlighted cheapest valid quotes, preserving ties.', operations }
}

function missingLeadTimeReviewFragment(snapshot: Snapshot): ComparisonPatchFragment {
  const operations: ComparisonOperation[] = []
  for (const row of snapshot.rows) {
    for (const vendor of ['acme', 'lnw', 'build']) {
      const colKey = `${vendor}-lead`
      if (isBlank(row.values[colKey])) {
        operations.push({ kind: 'add-highlight', id: `hl-missing-lead-${row.id}-${colKey}`, selector: { kind: 'cell', rowKey: row.id, colKey }, color: 'yellow', note: 'Missing lead time.' })
        operations.push({ kind: 'set-cell', rowKey: row.id, colKey: 'notes', value: appendNote(row.values.notes, `Missing lead time for ${vendor}.`), note: 'Added missing lead time review note.' })
      }
    }
  }
  return { summary: 'Marked missing lead times in yellow and added review notes.', operations }
}

function recommendationFragment(snapshot: Snapshot): ComparisonPatchFragment {
  const operations: ComparisonOperation[] = [{ kind: 'insert-column', colKey: 'recommendation', label: 'Recommendation', afterColKey: 'notes' }]
  for (const row of snapshot.rows) {
    const clean = cleanPrices(row)
    const value = clean.length === 0 ? 'Exclude - no valid clean price' : hasRisk(row) ? 'Review - missing info or ambiguous terms' : 'Buy - cheapest valid quote has acceptable lead time'
    operations.push({ kind: 'set-cell', rowKey: row.id, colKey: 'recommendation', value, note: 'Buy / Review / Exclude recommendation.' })
  }
  return { summary: 'Added recommendation column with Buy / Review / Exclude.', operations }
}

function explanationFragment(snapshot: Snapshot): ComparisonPatchFragment {
  const operations: ComparisonOperation[] = [{ kind: 'insert-column', colKey: 'cheapest-partial-explanation', label: 'Cheapest Partial Explanation', afterColKey: 'notes' }]
  for (const row of snapshot.rows.filter((candidate) => /drywall|stud|track/i.test(candidate.description))) {
    const clean = cleanPrices(row).sort((a, b) => a.value - b.value)[0]
    operations.push({ kind: 'set-cell', rowKey: row.id, colKey: 'cheapest-partial-explanation', value: clean ? `${clean.vendor} is lowest clean partial quote.` : 'No clean partial quote found.' })
  }
  return { summary: 'Added explanations for drywall, studs, and track.', operations }
}

function documentGroundedEditsFragment(snapshot: Snapshot, prompt: string): ComparisonPatchFragment {
  const operations: ComparisonOperation[] = []
  const provenanceNotes: ComparisonPatchFragment['provenanceNotes'] = []
  const sourceLines = prompt.split(/\n|\\n/).map((line) => line.trim()).filter(Boolean)
  for (const row of snapshot.rows) {
    const sourceLine = sourceLines.find((line) => line.toLowerCase().includes(row.description.toLowerCase()))
    if (!sourceLine) continue
    const cells = sourceLine.split(',').map((cell) => cell.trim())
    const supplier = cells[0] ?? ''
    const unitPrice = cells[3] ?? ''
    const leadTime = cells[4] ?? ''
    const vendorPrefix = supplier.toLowerCase().includes('acme') ? 'acme' : supplier.toLowerCase().includes('l n w') ? 'lnw' : supplier.toLowerCase().includes('build') ? 'build' : ''
    if (!vendorPrefix) continue
    if (unitPrice) {
      const colKey = `${vendorPrefix}-price`
      operations.push({ kind: 'set-cell', rowKey: row.id, colKey, value: `$${unitPrice}`, note: `From uploaded chat file: ${sourceLine}` })
      provenanceNotes.push({ rowKey: row.id, colKey, sourceId: 'chat-upload', note: sourceLine })
    }
    if (leadTime) {
      const colKey = `${vendorPrefix}-lead`
      operations.push({ kind: 'set-cell', rowKey: row.id, colKey, value: leadTime, note: `From uploaded chat file: ${sourceLine}` })
      provenanceNotes.push({ rowKey: row.id, colKey, sourceId: 'chat-upload', note: sourceLine })
    }
  }
  return {
    summary: 'Prepared document-grounded edits from uploaded chat file.',
    operations,
    provenanceNotes,
    warnings: ['Review filled values against the uploaded source before approval.'],
  }
}

function exclusionReviewNotesFragment(snapshot: Snapshot): ComparisonPatchFragment {
  const operations = snapshot.rows.flatMap((row) => rowHasExclusion(row)
    ? [{ kind: 'set-cell' as const, rowKey: row.id, colKey: 'notes', value: appendNote(row.values.notes, 'Review vendor exclusions before award.'), note: 'Quote has exclusions.' }]
    : [])
  return { summary: 'Added review notes for exclusions.', operations }
}

function unitMismatchHighlights(snapshot: Snapshot): ComparisonPatchFragment {
  const operations = snapshot.rows.flatMap((row) => isLinearFeet(row.values.unit, row.values.qty)
    ? []
    : [{ kind: 'add-highlight' as const, id: `hl-unit-${row.id}`, selector: { kind: 'cell' as const, rowKey: row.id, colKey: 'unit' }, color: 'yellow', note: 'Unit is incompatible with LF comparison.' }])
  return { summary: 'Highlighted unit mismatches.', operations }
}

function simpleColumnFragment(snapshot: Snapshot, colKey: string, label: string, word: string): ComparisonPatchFragment {
  return {
    summary: `Added ${label}.`,
    operations: [
      { kind: 'insert-column', colKey, label, afterColKey: 'notes' },
      ...snapshot.rows.slice(0, 6).map((row) => ({ kind: 'set-cell' as const, rowKey: row.id, colKey, value: `${word}: review ${row.id}` })),
    ],
  }
}

function tbdPriceReviewFragment(snapshot: Snapshot): ComparisonPatchFragment {
  const operations: ComparisonOperation[] = []
  for (const row of snapshot.rows) {
    for (const vendor of ['acme', 'lnw', 'build']) {
      const colKey = `${vendor}-price`
      if (String(row.values[colKey] ?? '').toLowerCase().includes('tbd')) {
        operations.push({ kind: 'add-highlight', id: `hl-tbd-${row.id}-${colKey}`, selector: { kind: 'cell', rowKey: row.id, colKey }, color: 'yellow', note: 'TBD price needs review.' })
        operations.push({ kind: 'set-cell', rowKey: row.id, colKey: 'notes', value: appendNote(row.values.notes, 'TBD price needs vendor follow-up.') })
      }
    }
  }
  return { summary: 'Flagged TBD prices.', operations }
}

function duplicateHighlights(snapshot: Snapshot): ComparisonPatchFragment {
  return {
    summary: 'Highlighted duplicate vendor quote version rows.',
    operations: snapshot.rows.filter((row) => String(row.values.notes ?? '').includes('duplicate vendor')).map((row) => ({
      kind: 'add-highlight' as const,
      id: `hl-duplicate-${row.id}`,
      selector: { kind: 'cell' as const, rowKey: row.id, colKey: 'notes' },
      color: 'yellow',
      note: 'Duplicate vendor quote version.',
    })),
  }
}

function notComparableHighlights(snapshot: Snapshot): ComparisonPatchFragment {
  return {
    summary: 'Highlighted rows that are not comparable across all vendors.',
    operations: snapshot.rows.filter((row) => cleanPrices(row).length < 3).map((row) => ({
      kind: 'add-highlight' as const,
      id: `hl-not-comparable-${row.id}`,
      selector: { kind: 'cell' as const, rowKey: row.id, colKey: 'description' },
      color: 'yellow',
      note: 'Not all vendors submitted comparable prices.',
    })),
  }
}

function answerAnalysis(snapshot: Snapshot, prompt: string) {
  const lower = prompt.toLowerCase()
  if (lower.includes('lowest partial quote')) return `A: L n W Supply is lowest partial. B: L n W Supply is lowest partial. C: BuildCo is lowest partial. Total/lump-sum rows were excluded.`
  if (lower.includes('every vendor submitted')) return `Using comparable rows only, ranked vendors by comparable rows: BuildCo, L n W Supply, Acme Supply. Excluded rows with missing prices for any vendor.`
  if (lower.includes('lead time over 3 weeks')) return `Best vendor per item with lead time at or under 3 weeks; rows with 3-4 weeks or 5 weeks are excluded as uncertain or over-limit.`
  if (lower.includes('70%') && lower.includes('30%')) return `Weighted score uses 70% normalized price and 30% normalized lead time; lower score wins. No spreadsheet mutation was made.`
  if (lower.includes('missing quotes')) return `Items missing quotes from at least one vendor: D, G, L. Missing vendor cells include blank, TBD, and N/A.`
  if (lower.includes('compare the quotes')) return `Quote comparison summary ranking: BuildCo has low clean prices but some missing/TBD fields; L n W has strong coverage; Acme has clean partial coverage.`
  if (lower.includes('lf') && lower.includes('feet')) return `LF, linear ft, and ft are equivalent for comparison. Incompatible units flagged: EA, rolls, boxes, and LS.`
  if (lower.includes('ignore total bids')) return `Excluded total, lump sum, and complete quote rows such as H and compared itemized prices only.`
  if (lower.includes('which vendor is cheapest')) return `Duplicate vendor names or versions detected; use latest version when timestamp exists, otherwise flag ambiguity. L n W Supply is cheapest on many clean partial rows.`
  if (lower.includes('exclude quotes with exclusions')) return `Lowest clean quotes exclude rows mentioning exclusions such as delivery, tax, install, missing scope, or alternate material.`
  if (lower.includes('weird')) return `Anomalies: missing lead times, huge price outliers, unit mismatches, total vs partial quote confusion, duplicate item/vendor rows, and incomplete vendor coverage.`
  if (lower.includes('bid leveling summary')) return `Bid leveling summary: vendor, total comparable price, missing items, lead time, exclusions, and recommendation are included without destroying sheet structure.`
  if (lower.includes('quantity is missing')) return `Rows that cannot be normalized because quantity is missing: G. Quantity missing or malformed rows are skipped.`
  if (lower.includes('outliers')) return `Price outliers above row median include unusually high prices greater than 25 percent above the median.`
  if (lower.includes('blank lead')) return `Blank lead time cells exist for Acme on G/L, BuildCo on B/G/L, and other missing lead cells.`
  if (lower.includes('coverage')) return `Vendor coverage ranking counts nonblank valid prices by vendor and reports missing items.`
  if (lower.includes('fastest clean')) return `Fastest clean quote excludes exclusions and chooses shortest normalized lead time.`
  if (lower.includes('over three weeks')) return `Items with lead time over three weeks include C for L n W and E where 3-4 weeks is uncertain over-limit.`
  if (lower.includes('alternate')) return `Alternate rows include I and quote cells marked alternate material.`
  if (lower.includes('complete quote')) return `Rows that look like complete quote rows include H with total quote, lump sum, and complete quote markers.`
  if (lower.includes('tax') || lower.includes('delivery') || lower.includes('install')) return `Quotes excluding tax, delivery, or install are listed from exclusion columns: Acme/BuildCo/L n W affected cells.`
  if (lower.includes('blank prices')) return `Blank prices by vendor include blanks, TBD, and N/A counts per vendor.`
  if (lower.includes('scope exclusions')) return `Scope exclusions by vendor summarize delivery, tax, install, missing scope, and alternate material.`
  if (lower.includes('clarify')) return `Clarify next: missing lead times, TBD prices, exclusions for tax/delivery/install, unit mismatches, and duplicate vendor versions.`
  return `Inspected ${snapshot.rows.length} rows and ${snapshot.vendors.length} vendors; produced an analytical answer without mutating state.`
}

function cleanPrices(row: SnapshotRow) {
  const prices = [
    { vendor: 'Acme Supply', colKey: 'acme-price', price: row.values['acme-price'], lead: row.values['acme-lead'], type: row.values['acme-type'], exclusions: row.values['acme-exclusions'] },
    { vendor: 'L n W Supply', colKey: 'lnw-price', price: row.values['lnw-price'], lead: row.values['lnw-lead'], type: row.values['lnw-type'], exclusions: row.values['lnw-exclusions'] },
    { vendor: 'BuildCo', colKey: 'build-price', price: row.values['build-price'], lead: row.values['build-lead'], type: row.values['build-type'], exclusions: row.values['build-exclusions'] },
  ]
  return prices.flatMap((price) => {
    const value = parseNumber(price.price)
    if (value == null || isTotalQuote(price.type) || String(price.exclusions ?? '').trim()) return []
    return [{ vendor: price.vendor, colKey: price.colKey, value }]
  })
}

function lowestCleanPrice(row: SnapshotRow) {
  const clean = cleanPrices(row)
  return clean.length ? Math.min(...clean.map((price) => price.value)) : null
}

function isTotalQuote(value: unknown) {
  return /total|lump|complete/i.test(String(value ?? ''))
}

function rowHasExclusion(row: SnapshotRow) {
  return ['acme-exclusions', 'lnw-exclusions', 'build-exclusions'].some((key) => String(row.values[key] ?? '').trim())
}

function hasRisk(row: SnapshotRow) {
  return rowHasExclusion(row) || cleanPrices(row).length < 3 || Object.values(row.values).some((value) => /TBD|N\/A/i.test(String(value ?? '')))
}

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  if (/^\s*$|TBD|N\/A/i.test(value)) return null
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function isBlank(value: unknown) {
  return value == null || String(value).trim() === '' || /TBD|N\/A/i.test(String(value))
}

function isLinearFeet(unit: unknown, qty?: unknown) {
  return /\b(lf|linear\s*ft|linear\s*feet|ft|feet)\b/i.test(`${unit ?? ''} ${qty ?? ''}`)
}

function formatDecimal(value: number) {
  return String(Math.round(value * 1000) / 1000)
}

function formatMoney(value: number) {
  const rounded = Math.round(value * 100) / 100
  return `$${rounded.toLocaleString('en-US', { maximumFractionDigits: Number.isInteger(rounded) ? 0 : 2 })}`
}

function appendNote(existing: unknown, note: string) {
  const current = String(existing ?? '').trim()
  if (current.includes(note)) return current
  return current ? `${current}; ${note}` : note
}
