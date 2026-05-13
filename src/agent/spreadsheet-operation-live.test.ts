import ExcelJS from 'exceljs'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { InMemoryUserContextProvider } from '../context/user-context-provider.js'
import { RialtoAgentCore } from './core.js'
import { OpenAIAgentsProductRuntime } from './openai-agents-runtime.js'
import { clearUploadedWorkbooksForTests, registerUploadedWorkbook } from './workbook-attachments.js'

const runLiveAgentEvals = process.env.RUN_LIVE_AGENT_EVALS === 'true' && Boolean(process.env.OPENAI_API_KEY)
const maybeIt = runLiveAgentEvals ? it : it.skip

const user = {
  id: 'user-live-1',
  contractorOrganizationId: 'org-live-1',
  role: 'estimator' as const,
  name: 'Estimator Live',
  email: 'estimator@example.com',
}

describe('Spreadsheet operation live agent evals', () => {
  maybeIt('routes vague attached vendor requests through the model-selected workbook merge tool', async () => {
    const scenarioDir = path.resolve(process.cwd(), '../data/test_scenarios/01-buildco-as-harbor-steel-merge')
    const baseComparisonPath = path.join(scenarioDir, 'base-comparison.xlsx')
    const attachmentPath = path.join(scenarioDir, 'attach-harbor-steel-response.xlsx')
    if (!existsSync(baseComparisonPath) || !existsSync(attachmentPath)) {
      throw new Error(`Missing Harbor Steel scenario files under ${scenarioDir}`)
    }

    const prompts = [
      'add in this vendor',
      'merge this attached vendor response',
      'bring this quote into the comparison',
      'please add the attached spreadsheet as the new vendor bid',
    ]
    for (const prompt of prompts) {
      clearUploadedWorkbooksForTests()
      const uploaded = await registerUploadedWorkbook({
        filename: 'attach-harbor-steel-response.xlsx',
        buffer: await readFile(attachmentPath),
        now: '2026-05-12T12:00:00.000Z',
      })
      const core = new RialtoAgentCore(new InMemoryUserContextProvider(), new OpenAIAgentsProductRuntime())

      const response = await core.runTurn({
        requestId: `live-harbor-merge-${slug(prompt)}`,
        user,
        messages: [{ role: 'user', content: prompt }],
        debug: true,
        currentPage: { path: '/contractor/projects/live/rfqs/live', title: 'Quote Comparison' },
        quoteComparison: {
          snapshot: await snapshotFromComparisonWorkbook(baseComparisonPath),
          attachments: [{
            id: uploaded.id,
            filename: uploaded.filename,
            sourceKind: 'excel',
            workbookId: uploaded.workbookId,
            summary: uploaded.summary,
          }],
        },
      })

      const proposal = response.proposal
      const operations = proposal?.operations ?? []
      expect.soft(response.status, prompt).toBe('completed')
      expect.soft(response.toolResults.map((toolResult) => toolResult.toolId), prompt).toContain('quoteComparison.mergeAttachedVendorWorkbook')
      expect.soft(proposal?.approvalMode, prompt).toBe('approve-all-or-discard')
      expect.soft(proposal?.summary, prompt).toContain('Harbor Steel Supply')
      expect.soft(proposal?.summary, prompt).not.toContain('attach harbor steel')
      expect.soft(operations.filter((operation) => operation.kind === 'insert-column'), prompt).toHaveLength(4)
      expect.soft(operations.filter((operation) => operation.kind === 'set-cell'), prompt).toHaveLength(26)
      expect.soft(operations, prompt).toEqual(expect.arrayContaining([
        { kind: 'set-cell', rowKey: 'row-2', colKey: 'vendor-harbor-steel-supply:total', value: 2642.16, note: expect.stringContaining('row 5') },
      ]))
    }
    clearUploadedWorkbooksForTests()
  }, 360_000)
})

async function snapshotFromComparisonWorkbook(filename: string) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filename)
  const sheet = workbook.worksheets[0]
  const headers = rowTexts(sheet.getRow(1), sheet.actualColumnCount)
  const columns = headers.map((label) => ({ key: slug(label), label, kind: 'rfq-core' }))
  return {
    sheetId: `sheet:${path.basename(filename)}`,
    quoteRequestId: 'rfq-scenario-1',
    columns,
    rows: Array.from({ length: sheet.actualRowCount - 1 }, (_value, index) => {
      const rowNumber = index + 2
      const values = rowTexts(sheet.getRow(rowNumber), sheet.actualColumnCount)
      const valueByKey = Object.fromEntries(columns.map((column, columnIndex) => [column.key, values[columnIndex] ?? '']))
      return {
        id: `row-${rowNumber}`,
        description: valueByKey.description,
        hidden: false,
        values: valueByKey,
      }
    }),
    vendors: [],
    highlights: [],
    hiddenState: { columnKeys: [], rowIds: [] },
    deletedState: { columnKeys: [], rowIds: [] },
  }
}

function rowTexts(row: ExcelJS.Row, columnCount: number) {
  return Array.from({ length: columnCount }, (_value, index) => {
    const cell = row.getCell(index + 1)
    return cell.text || String(cell.value ?? '')
  })
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
