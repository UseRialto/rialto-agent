import ExcelJS from 'exceljs'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryUserContextProvider } from '../context/user-context-provider.js'
import type { ProductAgentRuntimeRequest } from './core.js'
import {
  buildVendorMergePlan,
  SpreadsheetOperationRuntime,
  validateSpreadsheetOperationPlan,
} from './spreadsheet-operation-runtime.js'
import { clearUploadedWorkbooksForTests, registerUploadedWorkbook } from './workbook-attachments.js'

const user = {
  id: 'user-1',
  contractorOrganizationId: 'org-1',
  role: 'estimator' as const,
  name: 'Estimator One',
  email: 'estimator@example.com',
}

const snapshot = {
  sheetId: 'sheet:rfq-1',
  quoteRequestId: 'rfq-1',
  columns: [
    { key: 'item', label: 'Item', kind: 'rfq-core' },
    { key: 'description', label: 'Description', kind: 'rfq-core' },
    { key: 'qty', label: 'Qty', kind: 'rfq-core' },
    { key: 'unit', label: 'Unit', kind: 'rfq-core' },
  ],
  rows: [
    { id: 'line-x', description: 'Drywall 5/8 Type X', hidden: false, values: { item: 'X', description: 'Drywall 5/8 Type X', qty: '12500', unit: 'LF' } },
    { id: 'line-y', description: 'Metal studs 20ga', hidden: false, values: { item: 'Y', description: 'Metal studs 20ga', qty: '8000', unit: 'LF' } },
  ],
  vendors: [],
  highlights: [],
  hiddenState: { columnKeys: [], rowIds: [] },
  deletedState: { columnKeys: [], rowIds: [] },
}

afterEach(() => {
  clearUploadedWorkbooksForTests()
})

describe('SpreadsheetOperationRuntime', () => {
  it('validates operation plans before execution', () => {
    const valid = buildVendorMergePlan({
      userRequest: 'Merge this attached workbook.',
      targetWorkbookId: 'current-comparison',
      workbookId: 'wb-1',
      vendorNameHint: 'BuildCo',
    })
    expect(validateSpreadsheetOperationPlan(valid)).toEqual({ ok: true, errors: [] })

    expect(validateSpreadsheetOperationPlan({
      ...valid,
      steps: valid.steps.filter((step) => step.toolName !== 'match_vendor_rows_to_comparison_items'),
    })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(['Vendor merge plan is missing match_vendor_rows_to_comparison_items.']),
    })

    expect(validateSpreadsheetOperationPlan({
      ...valid,
      riskLevel: 'destructive',
      requiresApproval: false,
    })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(['Destructive spreadsheet operations require approval.']),
    })

    expect(validateSpreadsheetOperationPlan({
      ...valid,
      steps: [{ ...valid.steps[0], toolName: 'shell_out_and_edit_cells' }],
    })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(['Plan calls an unknown spreadsheet operation tool.']),
    })
  })

  it('runs the attached vendor workbook merge path and returns a proposal plus observations', async () => {
    const uploaded = await registerUploadedWorkbook({
      filename: 'BuildCo response.xlsx',
      buffer: await workbookBuffer([
        ['Item', 'Description', 'Qty', 'Unit', 'Unit Price', 'Total', 'Lead Time'],
        ['X', 'Drywall 5/8 Type X', '12500', 'LF', '$0.12', '$1,500', '4 weeks'],
        ['Y', 'Metal studs 20ga', '8000', 'LF', '$0.11', '$880', '2 weeks'],
        ['PKG', 'Project lump sum quote', '1', 'LS', '', '$9,100', '2 weeks'],
      ]),
      now: '2026-05-12T12:00:00.000Z',
    })
    const userContext = await new InMemoryUserContextProvider().buildForUser(user)
    const result = await new SpreadsheetOperationRuntime().runOperation({
      requestId: 'req-merge',
      userContext,
      messages: [{ role: 'user', content: "This attached workbook is BuildCo's response. Merge it into the current comparison." }],
      requestContext: {
        quoteComparison: {
          snapshot,
          attachments: [{
            id: uploaded.id,
            filename: uploaded.filename,
            sourceKind: 'excel',
            workbookId: uploaded.workbookId,
            summary: uploaded.summary,
          }],
        },
      },
    } satisfies ProductAgentRuntimeRequest)

    expect(result).toMatchObject({
      handled: true,
      status: 'completed',
      operationPlan: { mode: 'propose_patch', requiresApproval: true },
      verification: { ok: true },
    })
    expect(result.observations?.map((observation) => observation.toolName)).toEqual([
      'load_current_comparison_workbook',
      'load_uploaded_workbook',
      'extract_vendor_response_from_workbook',
      'match_vendor_rows_to_comparison_items',
      'detect_conflicting_existing_values',
      'create_vendor_merge_patch',
      'verify_vendor_merge_patch',
    ])
    const fragment = result.toolResults?.find((toolResult) => toolResult.data && typeof toolResult.data === 'object' && (toolResult.data as { action?: string }).action === 'comparison-patch-fragment')?.data as { fragment?: { operations?: unknown[] } } | undefined
    expect(fragment?.fragment?.operations).toEqual(expect.arrayContaining([
      { kind: 'insert-column', colKey: 'vendor-buildco:unit_price', label: 'BuildCo Unit Price', afterColKey: 'unit' },
      { kind: 'insert-column', colKey: 'vendor-buildco:total', label: 'BuildCo Total', afterColKey: 'vendor-buildco:unit_price' },
      { kind: 'set-cell', rowKey: 'line-x', colKey: 'vendor-buildco:total', value: 1500, note: expect.stringContaining('row 2') },
    ]))
  })

  it('routes natural add-vendor spreadsheet wording to the deterministic merge path', async () => {
    const uploaded = await registerUploadedWorkbook({
      filename: 'attach-harbor-steel-response.xlsx',
      buffer: await workbookBuffer([
        ['Line #', 'Product Code', 'Material Description', 'Requested Qty', 'U/M', 'Each', 'Ext Amount', 'Availability'],
        ['X', '250CH-33', 'Drywall 5/8 Type X', '12500', 'LF', '$0.12', '$1,500', '4 weeks'],
        ['Y', '362S125-30', 'Metal studs 20ga', '8000', 'LF', '$0.11', '$880', '2 weeks'],
      ]),
      now: '2026-05-12T12:00:00.000Z',
    })
    const userContext = await new InMemoryUserContextProvider().buildForUser(user)

    const result = await new SpreadsheetOperationRuntime().runOperation({
      requestId: 'req-natural-add',
      userContext,
      messages: [{ role: 'user', content: 'add harbor steel in the spreadsheet' }],
      requestContext: {
        quoteComparison: {
          snapshot,
          attachments: [{
            id: uploaded.id,
            filename: uploaded.filename,
            sourceKind: 'excel',
            workbookId: uploaded.workbookId,
            summary: uploaded.summary,
          }],
        },
      },
    } satisfies ProductAgentRuntimeRequest)

    expect(result).toMatchObject({
      handled: true,
      status: 'completed',
      operationPlan: { mode: 'propose_patch' },
    })
    const fragment = result.toolResults?.find((toolResult) => toolResult.data && typeof toolResult.data === 'object' && (toolResult.data as { action?: string }).action === 'comparison-patch-fragment')?.data as { fragment?: { summary?: string; operations?: unknown[] } } | undefined
    expect(fragment?.fragment?.summary).toContain('Harbor Steel')
    expect(fragment?.fragment?.operations).toEqual(expect.arrayContaining([
      { kind: 'insert-column', colKey: 'vendor-harbor-steel:unit_price', label: 'Harbor Steel Unit Price', afterColKey: 'unit' },
      { kind: 'insert-column', colKey: 'vendor-harbor-steel:total', label: 'Harbor Steel Total', afterColKey: 'vendor-harbor-steel:unit_price' },
      { kind: 'set-cell', rowKey: 'line-x', colKey: 'vendor-harbor-steel:total', value: 1500, note: expect.stringContaining('row 2') },
    ]))
  })

  it('blocks attached workbook merges when no uploaded rows match the comparison', async () => {
    const uploaded = await registerUploadedWorkbook({
      filename: 'attach-harbor-steel-response.xlsx',
      buffer: await workbookBuffer([
        ['Vendor', 'Harbor Steel Supply'],
        ['Project', 'MCRD P-314'],
        [],
        ['Line #', 'Product Code', 'Material Description', 'Requested Qty', 'U/M', 'Each', 'Ext Amount', 'Availability'],
        ['A001', '250CH-33', 'Shaftwall liner panels', '2420', 'EA', '$1.09', '$2,642.16', '3-4 weeks'],
      ]),
      now: '2026-05-12T12:00:00.000Z',
    })
    const userContext = await new InMemoryUserContextProvider().buildForUser(user)

    const result = await new SpreadsheetOperationRuntime().runOperation({
      requestId: 'req-zero-match',
      userContext,
      messages: [{ role: 'user', content: 'add harbor steel in the spreadsheet' }],
      requestContext: {
        quoteComparison: {
          snapshot,
          attachments: [{
            id: uploaded.id,
            filename: uploaded.filename,
            sourceKind: 'excel',
            workbookId: uploaded.workbookId,
            summary: uploaded.summary,
          }],
        },
      },
    } satisfies ProductAgentRuntimeRequest)

    expect(result).toMatchObject({
      handled: true,
      status: 'blocked',
      reason: expect.stringContaining('0 uploaded rows matched'),
    })
    expect(result.toolResults?.some((toolResult) => toolResult.toolId === 'quoteComparison.createVendorMergePatch')).toBe(false)
  })

  it('uses workbook vendor identity and matches the Harbor Steel scenario when the request only says add this vendor', async () => {
    const scenarioDir = path.resolve(process.cwd(), '../data/test_scenarios/01-buildco-as-harbor-steel-merge')
    const baseComparisonPath = path.join(scenarioDir, 'base-comparison.xlsx')
    const attachmentPath = path.join(scenarioDir, 'attach-harbor-steel-response.xlsx')
    if (!existsSync(baseComparisonPath) || !existsSync(attachmentPath)) return

    const uploaded = await registerUploadedWorkbook({
      filename: 'attach-harbor-steel-response.xlsx',
      buffer: await readFile(attachmentPath),
      now: '2026-05-12T12:00:00.000Z',
    })
    const userContext = await new InMemoryUserContextProvider().buildForUser(user)

    const result = await new SpreadsheetOperationRuntime().runOperation({
      requestId: 'req-harbor-scenario',
      userContext,
      messages: [{ role: 'user', content: 'add in this vendor' }],
      requestContext: {
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
      },
    } satisfies ProductAgentRuntimeRequest)

    expect(result).toMatchObject({
      handled: true,
      status: 'completed',
      verification: { ok: true },
    })
    const fragment = result.toolResults?.find((toolResult) => toolResult.data && typeof toolResult.data === 'object' && (toolResult.data as { action?: string }).action === 'comparison-patch-fragment')?.data as { fragment?: { summary?: string; operations?: unknown[]; provenanceNotes?: unknown[] } } | undefined
    expect(fragment?.fragment?.summary).toContain('Harbor Steel Supply')
    expect(fragment?.fragment?.summary).not.toContain('attach harbor steel')
    expect(fragment?.fragment?.operations?.filter((operation) => typeof operation === 'object' && operation !== null && (operation as { kind?: string }).kind === 'set-cell')).toHaveLength(26)
    expect(fragment?.fragment?.operations).toEqual(expect.arrayContaining([
      { kind: 'insert-column', colKey: 'vendor-harbor-steel-supply:total', label: 'Harbor Steel Supply Total', afterColKey: expect.any(String) },
      { kind: 'set-cell', rowKey: 'row-2', colKey: 'vendor-harbor-steel-supply:total', value: 2642.16, note: expect.stringContaining('row 5') },
    ]))
    expect(fragment?.fragment?.provenanceNotes).toEqual(expect.arrayContaining([
      { rowKey: 'row-2', colKey: 'vendor-harbor-steel-supply:total', sourceId: uploaded.workbookId, note: expect.stringContaining('basis item_code') },
    ]))
    expect(result.toolResults?.filter((toolResult) => toolResult.status === 'needs-user-action')).toEqual([])
  })

  it('ignores generic model-supplied vendor names and prefers workbook identity', async () => {
    const scenarioDir = path.resolve(process.cwd(), '../data/test_scenarios/01-buildco-as-harbor-steel-merge')
    const baseComparisonPath = path.join(scenarioDir, 'base-comparison.xlsx')
    const attachmentPath = path.join(scenarioDir, 'attach-harbor-steel-response.xlsx')
    if (!existsSync(baseComparisonPath) || !existsSync(attachmentPath)) return

    const uploaded = await registerUploadedWorkbook({
      filename: 'attach-harbor-steel-response.xlsx',
      buffer: await readFile(attachmentPath),
      now: '2026-05-12T12:00:00.000Z',
    })
    const userContext = await new InMemoryUserContextProvider().buildForUser(user)

    const result = await new SpreadsheetOperationRuntime().runVendorWorkbookMerge({
      requestId: 'req-generic-model-vendor-name',
      userContext,
      messages: [{ role: 'user', content: 'please add the attached spreadsheet as the new vendor bid' }],
      requestContext: {
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
      },
    } satisfies ProductAgentRuntimeRequest, {
      explicitVendorName: 'The Spreadsheet As The New Vendor Bid',
    })

    expect(result).toMatchObject({ handled: true, status: 'completed' })
    const fragment = result.toolResults?.find((toolResult) => toolResult.data && typeof toolResult.data === 'object' && (toolResult.data as { action?: string }).action === 'comparison-patch-fragment')?.data as { fragment?: { summary?: string; operations?: unknown[] } } | undefined
    expect(fragment?.fragment?.summary).toContain('Harbor Steel Supply')
    expect(fragment?.fragment?.summary).not.toContain('The Spreadsheet As The New Vendor Bid')
    expect(fragment?.fragment?.operations).toEqual(expect.arrayContaining([
      { kind: 'set-cell', rowKey: 'row-2', colKey: 'vendor-harbor-steel-supply:total', value: 2642.16, note: expect.stringContaining('row 5') },
    ]))
  })

  it('asks for clarification when vendor identity is not safe enough', async () => {
    const uploaded = await registerUploadedWorkbook({
      filename: 'response.xlsx',
      buffer: await workbookBuffer([
        ['Item', 'Description', 'Total'],
        ['X', 'Drywall 5/8 Type X', '$1,500'],
      ]),
    })
    const userContext = await new InMemoryUserContextProvider().buildForUser(user)
    const result = await new SpreadsheetOperationRuntime().runOperation({
      requestId: 'req-clarify',
      userContext,
      messages: [{ role: 'user', content: 'Merge this attached workbook into the comparison.' }],
      requestContext: {
        quoteComparison: {
          snapshot,
          attachments: [{ id: uploaded.id, filename: uploaded.filename, sourceKind: 'excel', workbookId: uploaded.workbookId }],
        },
      },
    })

    expect(result).toMatchObject({
      handled: true,
      status: 'needs_clarification',
      clarification: { question: 'Which vendor should I use for the attached workbook response?' },
    })
  })
})

async function workbookBuffer(rows: Array<Array<string | number>>) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Quote')
  for (const row of rows) sheet.addRow(row)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

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
