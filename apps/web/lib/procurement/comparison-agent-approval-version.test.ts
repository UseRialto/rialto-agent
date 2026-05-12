import { describe, expect, it } from 'vitest'
import {
  comparisonViewPatchFromProposal,
  workbookVersionMetadataFromApprovedComparisonPatch,
  type ComparisonPatchProposal,
} from './comparison-agent-tools'
import { buildComparisonSheetVersion, normalizeComparisonSheetView } from './comparison-sheet-state'

describe('approved Quote Comparison agent proposals', () => {
  it('carry the original proposal into durable workbook version provenance', () => {
    const proposal: ComparisonPatchProposal = {
      kind: 'comparison-patch-proposal',
      summary: 'Updated unit price and total.',
      operations: [
        { kind: 'set-cell', rowKey: 'steel-frame', colKey: 'acme-unit', value: '$110' },
        { kind: 'set-cell', rowKey: 'steel-frame', colKey: 'acme-total', value: '$220' },
      ],
    }
    const patch = comparisonViewPatchFromProposal(proposal)
    const previousView = normalizeComparisonSheetView({})
    const nextView = normalizeComparisonSheetView({
      cellOverrides: Object.fromEntries(patch.setCells!.map((cell) => [`${cell.rowKey}|${cell.colKey}`, cell.value])),
    })

    const version = buildComparisonSheetVersion({
      previousView,
      nextView,
      latestVersionNumber: 4,
      currentVersionId: 12,
      createdAt: '2026-05-12T04:00:00.000Z',
      metadata: workbookVersionMetadataFromApprovedComparisonPatch(patch, 'user-1'),
    })

    expect(version).toMatchObject({
      version: {
        versionNumber: 5,
        parentVersionId: 12,
        source: 'agent-proposal',
        summary: 'Updated unit price and total.',
        actorUserId: 'user-1',
        proposalJson: JSON.stringify(proposal),
      },
    })
  })
})
