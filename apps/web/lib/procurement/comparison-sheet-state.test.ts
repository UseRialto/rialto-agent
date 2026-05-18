import { describe, expect, it } from 'vitest'
import {
  applyComparisonSheetCellOverrides,
  applyLocalWorkbookEdit,
  buildComparisonSheetVersion,
  buildComparisonSheetVersionSave,
  getWorkbookUndoRedoTargets,
  labelWorkbookVersionActors,
  mergeWorkbookVersionSummaries,
  normalizeComparisonSheetView,
  undoLocalWorkbookEdit,
} from './comparison-sheet-state'

describe('normalizeComparisonSheetView', () => {
  it('preserves live workbook mutations while filling missing defaults', () => {
    expect(normalizeComparisonSheetView({
      hiddenColumnKeys: ['vendor-total'],
      hiddenLineItemIds: ['line-1'],
      cellOverrides: { 'line-1|notes': 'Field verify' },
      columnLabelOverrides: { notes: 'Scope Notes' },
      acknowledgedReviewHighlightIds: ['email-review-line-1-vendor-a-unit_price', 42],
    } as unknown)).toMatchObject({
      hiddenColumnKeys: ['vendor-total'],
      hiddenLineItemIds: ['line-1'],
      cellOverrides: { 'line-1|notes': 'Field verify' },
      columnLabelOverrides: { notes: 'Scope Notes' },
      acknowledgedReviewHighlightIds: ['email-review-line-1-vendor-a-unit_price'],
      manualColumns: [],
      manualLineItems: [],
    })
  })
})

describe('local workbook undo', () => {
  it('undoes a multi-cell clear as one workbook edit', () => {
    const before = normalizeComparisonSheetView({
      cellOverrides: {
        'line-1|vendor-a': '$10',
        'line-1|vendor-b': '$11',
        'line-2|vendor-a': '$12',
      },
    })
    const after = applyComparisonSheetCellOverrides(before, [
      { rowKey: 'line-1', colKey: 'vendor-a', value: '' },
      { rowKey: 'line-1', colKey: 'vendor-b', value: '' },
      { rowKey: 'line-2', colKey: 'vendor-a', value: '' },
    ])

    const edited = applyLocalWorkbookEdit({ current: before, undoStack: [], redoStack: [] }, after)
    const undone = undoLocalWorkbookEdit(edited)

    expect(edited.undoStack).toHaveLength(1)
    expect(undone.current.cellOverrides).toEqual(before.cellOverrides)
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

  it('keeps autosaved cell-level edits out of durable version history', () => {
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
      metadata: { source: 'estimator-edit', historyMode: 'autosave' },
    })).toBeNull()
  })
})

describe('buildComparisonSheetVersionSave', () => {
  it('creates a baseline and applied version on the first saved edit so undo can go back', () => {
    const previous = normalizeComparisonSheetView({
      deletedColumnKeys: [],
      cellOverrides: { 'line-1|notes': 'Current note' },
    })
    const next = normalizeComparisonSheetView({
      deletedColumnKeys: ['vendor:acme:total'],
      cellOverrides: { 'line-1|notes': 'Current note' },
    })

    expect(buildComparisonSheetVersionSave({
      previousView: previous,
      nextView: next,
      latestVersionNumber: 0,
      currentVersionId: undefined,
      createdAt: '2026-05-12T03:00:00.000Z',
      metadata: { source: 'agent-proposal', summary: 'Delete total price columns.' },
    })).toMatchObject({
      view: next,
      versions: [
        {
          versionNumber: 1,
          source: 'system',
          summary: 'Started workbook history.',
          createdAt: '2026-05-12T03:00:00.000Z',
        },
        {
          versionNumber: 2,
          source: 'agent-proposal',
          summary: 'Delete total price columns.',
          createdAt: '2026-05-12T03:00:00.000Z',
        },
      ],
    })
  })
})

describe('getWorkbookUndoRedoTargets', () => {
  it('uses durable workbook versions for undo and redo targets', () => {
    expect(getWorkbookUndoRedoTargets({
      currentVersionId: 3,
      versions: [
        { id: 3, versionNumber: 3, source: 'agent-proposal', summary: 'AI cleaned totals.', actorUserId: 'user-1', createdAt: '2026-05-12T03:02:00.000Z' },
        { id: 2, versionNumber: 2, source: 'estimator-edit', summary: 'Edited unit price.', actorUserId: 'user-1', createdAt: '2026-05-12T03:01:00.000Z' },
        { id: 1, versionNumber: 1, source: 'import', summary: 'Imported workbook.', createdAt: '2026-05-12T03:00:00.000Z' },
      ],
    })).toEqual({
      undoVersionId: 2,
      redoVersionId: undefined,
    })
  })

  it('lets a restore version redo to the version it undid and undo deeper from the restored version', () => {
    expect(getWorkbookUndoRedoTargets({
      currentVersionId: 4,
      versions: [
        { id: 4, versionNumber: 4, parentVersionId: 3, source: 'restore', summary: 'Restored workbook version 2.', actorUserId: 'user-1', restoredVersionId: 2, restoreKind: 'undo', createdAt: '2026-05-12T03:03:00.000Z' },
        { id: 3, versionNumber: 3, source: 'agent-proposal', summary: 'AI cleaned totals.', actorUserId: 'user-1', createdAt: '2026-05-12T03:02:00.000Z' },
        { id: 2, versionNumber: 2, source: 'estimator-edit', summary: 'Edited unit price.', actorUserId: 'user-1', createdAt: '2026-05-12T03:01:00.000Z' },
        { id: 1, versionNumber: 1, source: 'import', summary: 'Imported workbook.', createdAt: '2026-05-12T03:00:00.000Z' },
      ],
    })).toEqual({
      undoVersionId: 1,
      redoVersionId: 3,
    })
  })

  it('does not keep redo enabled after a redo restore creates a new version', () => {
    expect(getWorkbookUndoRedoTargets({
      currentVersionId: 5,
      versions: [
        { id: 5, versionNumber: 5, parentVersionId: 4, source: 'restore', summary: 'Restored workbook version 3.', restoredVersionId: 3, restoreKind: 'redo', createdAt: '2026-05-12T03:04:00.000Z' },
        { id: 4, versionNumber: 4, parentVersionId: 3, source: 'restore', summary: 'Restored workbook version 2.', restoredVersionId: 2, restoreKind: 'undo', createdAt: '2026-05-12T03:03:00.000Z' },
        { id: 3, versionNumber: 3, source: 'agent-proposal', summary: 'AI cleaned totals.', createdAt: '2026-05-12T03:02:00.000Z' },
        { id: 2, versionNumber: 2, source: 'system', summary: 'Started workbook history.', createdAt: '2026-05-12T03:01:00.000Z' },
      ],
    })).toEqual({
      undoVersionId: 4,
      redoVersionId: undefined,
    })
  })
})

describe('labelWorkbookVersionActors', () => {
  it('labels AI edits and current-user edits without requiring an actor name column in version storage', () => {
    expect(labelWorkbookVersionActors([
      { id: 2, versionNumber: 2, source: 'agent-proposal', summary: 'Applied agent proposal.', actorUserId: 'user-1', createdAt: '2026-05-12T03:01:00.000Z' },
      { id: 1, versionNumber: 1, source: 'estimator-edit', summary: 'Edited a cell.', actorUserId: 'user-1', createdAt: '2026-05-12T03:00:00.000Z' },
    ], { userId: 'user-1', name: 'Tomasz Jezak' })).toEqual([
      expect.objectContaining({ id: 2, actorName: 'Rialto AI' }),
      expect.objectContaining({ id: 1, actorName: 'Tomasz Jezak' }),
    ])
  })
})

describe('mergeWorkbookVersionSummaries', () => {
  it('keeps all versions created by the first apply so undo can target the baseline without a reload', () => {
    const merged = mergeWorkbookVersionSummaries([], [
      { id: 1, versionNumber: 1, source: 'system', summary: 'Started workbook history.', createdAt: '2026-05-12T03:00:00.000Z' },
      { id: 2, versionNumber: 2, source: 'agent-proposal', summary: 'Deleted total price columns.', createdAt: '2026-05-12T03:01:00.000Z' },
    ])

    expect(merged.map((version) => version.versionNumber)).toEqual([2, 1])
    expect(getWorkbookUndoRedoTargets({ versions: merged, currentVersionId: 2 })).toEqual({
      undoVersionId: 1,
      redoVersionId: undefined,
    })
  })
})
