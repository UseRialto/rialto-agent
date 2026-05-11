'use client'

import { useState } from 'react'
import {
  CONTRACTOR_ORDER_DISPLAY_STAGES,
  toContractorDisplayOrderStage,
  type ContractorDisplayOrderStage,
} from '@/lib/contractor-display'
import type { ContractorOrderStage, ContractorOrderStageProgress } from '@/lib/types/contractor'

interface Props {
  currentStage: ContractorOrderStage
  stageHistory: ContractorOrderStageProgress[]
}

function formatShort(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getDisplayStageProgress(
  displayStage: ContractorDisplayOrderStage,
  stageHistory: ContractorOrderStageProgress[],
): ContractorOrderStageProgress | null {
  const matchingStages: ContractorOrderStage[] =
    displayStage === 'received'
      ? ['confirmed']
      : displayStage === 'fulfilling'
        ? ['packaged']
        : displayStage === 'shipped'
          ? ['out_for_delivery', 'shipped']
          : ['delivered']

  const matchingHistory = stageHistory
    .filter((entry) => matchingStages.includes(entry.stage))
    .sort((a, b) => {
      const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0
      const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0
      return bTime - aTime
    })

  return matchingHistory[0] ?? null
}

export function ContractorOrderProgressStepper({ currentStage, stageHistory }: Props) {
  const currentDisplayStage = toContractorDisplayOrderStage(currentStage)
  const currentIndex = CONTRACTOR_ORDER_DISPLAY_STAGES.findIndex((stage) => stage.key === currentDisplayStage)
  const [selectedStage, setSelectedStage] = useState<ContractorDisplayOrderStage | null>(null)

  const selectedProgress = selectedStage
    ? getDisplayStageProgress(selectedStage, stageHistory)
    : null
  const selectedDef = selectedStage
    ? CONTRACTOR_ORDER_DISPLAY_STAGES.find((stage) => stage.key === selectedStage)
    : null

  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
      <div className="flex items-start">
        {CONTRACTOR_ORDER_DISPLAY_STAGES.map((stage, idx) => {
          const isCompleted = idx < currentIndex
          const isActive = idx === currentIndex
          const progress = getDisplayStageProgress(stage.key, stageHistory)

          return (
            <div key={stage.key} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {idx > 0 && (
                  <div
                    className="h-0.5 flex-1"
                    style={{ background: isCompleted || isActive ? '#2d6a4f' : '#e2d9cf' }}
                  />
                )}

                {isCompleted ? (
                  <button
                    type="button"
                    onClick={() => setSelectedStage((prev) => (prev === stage.key ? null : stage.key))}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all text-white"
                    style={{
                      background: selectedStage === stage.key ? '#2d6a4f' : '#a8d5ba',
                      outline: selectedStage === stage.key ? '3px solid #e8f4ee' : undefined,
                      outlineOffset: selectedStage === stage.key ? '2px' : undefined,
                    }}
                  >
                    ✓
                  </button>
                ) : (
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={isActive
                      ? { background: '#1e3a2f', color: '#ffffff', outline: '3px solid #ede8e2', outlineOffset: '2px' }
                      : { background: '#e2d9cf', color: '#8a9e96' }}
                  >
                    {idx + 1}
                  </div>
                )}

                {idx < CONTRACTOR_ORDER_DISPLAY_STAGES.length - 1 && (
                  <div
                    className="h-0.5 flex-1"
                    style={{ background: isCompleted ? '#2d6a4f' : '#e2d9cf' }}
                  />
                )}
              </div>

              <div className="mt-2 text-center">
                <p
                  className="text-xs font-medium"
                  style={isActive ? { color: '#1e3a2f' } : isCompleted ? { color: '#2d6a4f' } : { color: '#8a9e96' }}
                >
                  {stage.shortLabel}
                </p>
                {progress?.completed_at && (
                  <p className="mt-0.5 text-xs" style={{ color: '#8a9e96' }}>{formatShort(progress.completed_at)}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {selectedStage && selectedDef && (
        <div className="mt-5 rounded-lg border px-4 py-3" style={{ borderColor: '#e2d9cf', background: '#ede8e2' }}>
          <p className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>{selectedDef.label}</p>
          {selectedProgress?.completed_at && (
            <p className="mt-0.5 text-xs" style={{ color: '#8a9e96' }}>
              Updated {new Date(selectedProgress.completed_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          )}
          {selectedStage === 'shipped' && selectedProgress?.carrier && (
            <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs" style={{ color: '#8a9e96' }}>Carrier</p>
                <p className="font-medium" style={{ color: '#1e3a2f' }}>{selectedProgress.carrier}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: '#8a9e96' }}>Tracking</p>
                <p className="font-medium" style={{ color: '#1e3a2f', fontFamily: 'var(--font-dm-mono, monospace)' }}>{selectedProgress.tracking_number ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: '#8a9e96' }}>Ship Date</p>
                <p className="font-medium" style={{ color: '#1e3a2f' }}>{selectedProgress.ship_date ?? '-'}</p>
              </div>
            </div>
          )}
          {selectedProgress?.notes && (
            <p className="mt-2 text-sm" style={{ color: '#4a6358' }}>{selectedProgress.notes}</p>
          )}
        </div>
      )}
    </div>
  )
}
