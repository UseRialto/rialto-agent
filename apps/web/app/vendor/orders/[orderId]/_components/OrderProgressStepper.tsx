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

export function OrderProgressStepper({ currentStage, stageHistory }: Props) {
  const currentIndex = STAGES.findIndex((s) => s.stage === currentStage)

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

                {/* Circle */}
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={
                    isCompleted
                      ? { background: '#2d6a4f', color: '#ffffff' }
                      : isActive
                        ? { background: '#1e3a2f', color: '#ffffff', outline: '4px solid #ede8e2', outlineOffset: '1px' }
                        : { background: '#ede8e2', color: '#8a9e96' }
                  }
                >
                  {isCompleted ? '✓' : idx + 1}
                </div>

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
    </div>
  )
}
