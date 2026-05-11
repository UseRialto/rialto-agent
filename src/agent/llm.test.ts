import { describe, expect, it } from 'vitest'
import { DeterministicPlanner } from './llm.js'
import type { LlmPlanRequest } from './llm.js'
import type { UserContext } from '../domain/types.js'

const userContext: UserContext = {
  generatedAt: '2026-05-11T00:00:00.000Z',
  user: {
    id: 'user-1',
    contractorOrganizationId: 'org-1',
    role: 'estimator',
    name: 'Estimator One',
    email: 'estimator@example.com',
  },
  pages: [],
  data: {
    projects: [],
    quoteRequests: [],
    comparisonSheets: [{
      id: 'sheet-doors-001',
      quoteRequestId: 'qr-doors-001',
      title: 'Door Hardware Quote Comparison',
      unresolvedReviewHighlightCount: 0,
      updatedAt: '2026-05-11T00:00:00.000Z',
    }],
    vendorDirectory: [],
  },
  procurementMemory: {
    materialNamingPatterns: [],
    unitNormalizationHints: [],
    recentSelectedVendors: [],
  },
}

function request(content: string): LlmPlanRequest {
  return {
    userContext,
    messages: [{ role: 'user', content }],
    tools: [{
      id: 'sheet.preview_comparison_patch',
      surface: 'spreadsheet-edit',
      description: 'Preview visible spreadsheet changes before applying them to a comparison sheet.',
      visibleToUser: true,
      mutatesPersistentData: false,
      requiresUserApproval: true,
    }],
  }
}

describe('DeterministicPlanner spreadsheet commands', () => {
  it('previews a requested comparison column deletion through the visible sheet tool', async () => {
    const plan = await new DeterministicPlanner().plan(request('Delete Description column'))

    expect(plan.toolCalls[0]).toMatchObject({
      toolId: 'sheet.preview_comparison_patch',
      input: {
        comparisonSheetId: 'sheet-doors-001',
        operations: [{ kind: 'delete-column', columnId: 'Description' }],
      },
    })
  })

  it('tolerates common spreadsheet command typos through the visible sheet tool', async () => {
    const plan = await new DeterministicPlanner().plan(request('deelte description clumn'))

    expect(plan.toolCalls[0]).toMatchObject({
      toolId: 'sheet.preview_comparison_patch',
      input: {
        operations: [{ kind: 'delete-column', columnId: 'description' }],
      },
    })
  })

  it('previews row, rename, sort, filter, and cell edit workbook commands', async () => {
    const cases = [
      ['delete Door hardware row', { kind: 'delete-row', rowId: 'Door hardware' }],
      ['rename Notes column to Scope Notes', { kind: 'rename-column', columnId: 'Notes', label: 'Scope Notes' }],
      ['sort Acme Total descending', { kind: 'sort-rows', columnId: 'Acme Total', direction: 'desc' }],
      ['filter blanks in Notes', { kind: 'filter-rows', columnId: 'Notes', predicate: 'empty' }],
      ['set Notes for Steel frame to Coordinate with GC', { kind: 'set-cell', rowId: 'Steel frame', columnId: 'Notes', value: 'Coordinate with GC' }],
    ] as const

    for (const [message, operation] of cases) {
      const plan = await new DeterministicPlanner().plan(request(message))
      expect(plan.toolCalls[0]?.input).toMatchObject({ operations: [operation] })
    }
  })

  it('previews multi-step numeric Quote Comparison edits as a bulk tool operation', async () => {
    const plan = await new DeterministicPlanner().plan(request('add 69 to all entries in unit price and then update total price accordingly'))

    expect(plan.toolCalls[0]?.input).toMatchObject({
      operations: [{
        kind: 'bulk-adjust-number-column',
        columnId: 'unit price',
        amount: 69,
        dependentColumnId: 'total price',
        dependentFormula: 'multiply-by-quantity',
      }],
    })
  })
})
