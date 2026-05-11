import { cn } from '@/lib/utils'

function getColor(score: number): string {
  if (score >= 8) return 'bg-green-500'
  if (score >= 5) return 'bg-amber-500'
  return 'bg-red-500'
}

function getTextColor(score: number): string {
  if (score >= 8) return 'text-green-700'
  if (score >= 5) return 'text-amber-700'
  return 'text-red-700'
}

interface ReliabilityScoreProps {
  score: number
  showLabel?: boolean
  className?: string
  compact?: boolean
}

export function ReliabilityScore({
  score,
  showLabel = true,
  className,
  compact = false,
}: ReliabilityScoreProps) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100))
  const fixed = score.toFixed(1)

  if (compact) {
    return (
      <span className={cn('font-semibold tabular-nums', getTextColor(score), className)}>
        {fixed}
      </span>
    )
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full', getColor(score))}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className={cn('text-sm font-semibold tabular-nums', getTextColor(score))}>
          {fixed}
        </span>
      )}
    </div>
  )
}
