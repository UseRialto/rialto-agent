import { cn } from '@/lib/utils'
import type { RiskLevel } from '@/lib/types/supplier'

const styles: Record<RiskLevel, string> = {
  low: 'bg-green-50 text-green-700 ring-green-600/20',
  medium: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  high: 'bg-red-50 text-red-700 ring-red-600/20',
}

const labels: Record<RiskLevel, string> = {
  low: 'LOW RISK',
  medium: 'MED RISK',
  high: 'HIGH RISK',
}

interface RiskBadgeProps {
  level: RiskLevel
  className?: string
  showFull?: boolean // show "LOW RISK" vs "LOW"
}

export function RiskBadge({ level, className, showFull = true }: RiskBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        styles[level],
        className,
      )}
    >
      {showFull ? labels[level] : level.toUpperCase()}
    </span>
  )
}
