'use client'

import { useState } from 'react'
import type { OrderStage, OrderStageProgress } from '@/lib/types/vendor'

interface Props {
  currentStage: OrderStage
  stageHistory: OrderStageProgress[]
}

const STAGES: { stage: OrderStage; label: string; shortLabel: string }[] = [
  { stage: 'confirmed', label: 'Order Confirmed', shortLabel: 'Confirmed' },
  { stage: 'packaged', label: 'Packaged', shortLabel: 'Packaged' },
  { stage: 'shipped', label: 'Shipped', shortLabel: 'Shipped' },
  { stage: 'out_for_delivery', label: 'Out for Delivery', shortLabel: 'Out for Delivery' },
  { stage: 'delivered', label: 'Delivered', shortLabel: 'Delivered' },
]

function formatShort(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function OrderProgressStepperClient({ currentStage, stageHistory }: Props) {
  const currentIndex = STAGES.findIndex((s) => s.stage === currentStage)
  const [selectedStage, setSelectedStage] = useState<OrderStage | null>(null)

  function toggleStage(stage: OrderStage) {
    setSelectedStage((prev) => (prev === stage ? null : stage))
  }

  const selectedProgress = selectedStage
    ? stageHistory.find((h) => h.stage === selectedStage)
    : null
  const selectedDef = selectedStage ? STAGES.find((s) => s.stage === selectedStage) : null

  return (
    <div
      className="rounded-xl p-5 shadow-sm"
      style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
    >
      <div className="flex items-start">
        {STAGES.map((s, idx) => {
          const isCompleted = idx < currentIndex
          const isActive = idx === currentIndex
          const progress = stageHistory.find((h) => h.stage === s.stage)

          return (
            <div key={s.stage} className="flex flex-1 flex-col items-center">
              {/* Step indicator + connector */}
              <div className="flex w-full items-center">
                {/* Left connector */}
                {idx > 0 && (
                  <div
                    className="h-0.5 flex-1"
                    style={{ background: isCompleted || isActive ? '#2d6a4f' : '#e2d9cf' }}
                  />
                )}

                {/* Circle - clickable when completed */}
                {isCompleted ? (
                  <button
                    type="button"
                    onClick={() => toggleStage(s.stage)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all"
                    style={
                      selectedStage === s.stage
                        ? { background: '#1e3a2f', color: '#ffffff', outline: '4px solid #ede8e2', outlineOffset: '1px' }
                        : { background: '#2d6a4f', color: '#ffffff' }
                    }
                    onMouseEnter={(e) => {
                      const btn = e.currentTarget as HTMLButtonElement
                      if (selectedStage !== s.stage) {
                        btn.style.background = '#1e3a2f'
                        btn.style.outline = '4px solid #ede8e2'
                      }
                    }}
                    onMouseLeave={(e) => {
                      const btn = e.currentTarget as HTMLButtonElement
                      if (selectedStage !== s.stage) {
                        btn.style.background = '#2d6a4f'
                        btn.style.outline = ''
                      }
                    }}
                  >
                    ✓
                  </button>
                ) : (
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={
                      isActive
                        ? { background: '#1e3a2f', color: '#ffffff', outline: '4px solid #ede8e2', outlineOffset: '1px' }
                        : { background: '#ede8e2', color: '#8a9e96' }
                    }
                  >
                    {idx + 1}
                  </div>
                )}

                {/* Right connector */}
                {idx < STAGES.length - 1 && (
                  <div
                    className="h-0.5 flex-1"
                    style={{ background: isCompleted ? '#2d6a4f' : '#e2d9cf' }}
                  />
                )}
              </div>

              {/* Label */}
              <div className="mt-2 text-center">
                <p
                  className="text-xs font-medium"
                  style={{
                    color: isActive ? '#1e3a2f' : isCompleted ? '#2d6a4f' : '#8a9e96',
                  }}
                >
                  {s.shortLabel}
                </p>
                {progress?.completed_at && (
                  <p className="mt-0.5 text-xs" style={{ color: '#8a9e96' }}>{formatShort(progress.completed_at)}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Stage detail panel */}
      {selectedStage && selectedDef && (
        <div
          className="mt-5 rounded-xl px-4 py-3"
          style={{ background: '#ede8e2', border: '1px solid #e2d9cf' }}
        >
          <p className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>{selectedDef.label}</p>
          {selectedProgress?.completed_at && (
            <p className="mt-0.5 text-xs" style={{ color: '#8a9e96' }}>
              Completed {new Date(selectedProgress.completed_at).toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric',
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
                <p
                  className="font-medium"
                  style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: '#1e3a2f' }}
                >
                  {selectedProgress.tracking_number ?? '-'}
                </p>
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
