import { describe, expect, it } from 'vitest'
import { buildComparisonSheetVersion, normalizeComparisonSheetView } from './comparison-sheet-state'

describe('normalizeComparisonSheetView', () => {
  it('preserves live workbook mutations while filling missing defaults', () => {
    expect(normalizeComparisonSheetView({
      hiddenColumnKeys: ['vendor-total'],
      hiddenLineItemIds: ['line-1'],
      cellOverrides: { 'line-1|notes': 'Field verify' },
      columnLabelOverrides: { notes: 'Scope Notes' },
    })).toMatchObject({
      hiddenColumnKeys: ['vendor-total'],
      hiddenLineItemIds: ['line-1'],
      cellOverrides: { 'line-1|notes': 'Field verify' },
      columnLabelOverrides: { notes: 'Scope Notes' },
      manualColumns: [],
      manualLineItems: [],
    })
  })
})

describe('deleteComparisonSheetColumns', () => {
  it('keeps deleted columns separate from reversible hidden columns', () => {
    expect(normalizeComparisonSheetView({
      hiddenColumnKeys: ['notes'],
      deletedColumnKeys: ['__desc'],
      hiddenLineItemIds: ['line-1'],
      deletedLineItemIds: ['line-2'],
    })).toMatchObject({
      hiddenColumnKeys: ['notes'],
      deletedColumnKeys: ['__desc'],
      hiddenLineItemIds: ['line-1'],
      deletedLineItemIds: ['line-2'],
    })
  })
})

describe('buildComparisonSheetVersion', () => {
  it('creates the next durable workbook version only when the normalized view changes', () => {
    const previous = normalizeComparisonSheetView({
      cellOverrides: { 'line-1|notes': 'Old note' },
    })
    const next = normalizeComparisonSheetView({
      cellOverrides: { 'line-1|notes': 'New note' },
    })

    expect(buildComparisonSheetVersion({
      previousView: previous,
      nextView: next,
      latestVersionNumber: 2,
      currentVersionId: 9,
      createdAt: '2026-05-12T03:00:00.000Z',
      metadata: {
        source: 'agent-proposal',
        summary: 'Updated notes from agent proposal.',
        actorUserId: 'user-1',
        proposal: { kind: 'comparison-patch-proposal', summary: 'Updated notes.' },
      },
    })).toMatchObject({
      view: next,
      version: {
        versionNumber: 3,
        parentVersionId: 9,
        source: 'agent-proposal',
        summary: 'Updated notes from agent proposal.',
        actorUserId: 'user-1',
        proposalJson: '{"kind":"comparison-patch-proposal","summary":"Updated notes."}',
        createdAt: '2026-05-12T03:00:00.000Z',
      },
    })

    expect(buildComparisonSheetVersion({
      previousView: next,
      nextView: next,
      latestVersionNumber: 3,
      currentVersionId: 10,
      createdAt: '2026-05-12T03:01:00.000Z',
      metadata: { source: 'estimator-edit' },
    })).toBeNull()
  })
})
