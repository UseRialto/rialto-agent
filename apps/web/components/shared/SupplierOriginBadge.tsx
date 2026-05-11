import { cn } from '@/lib/utils'

// Country code → flag emoji
function flagEmoji(countryCode: string): string {
  const code = countryCode.toUpperCase()
  const codePoints = [...code].map((c) => 0x1f1a5 + c.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

interface SupplierOriginBadgeProps {
  country: string
  isDomestic: boolean
  className?: string
  showLabel?: boolean
}

export function SupplierOriginBadge({
  country,
  isDomestic,
  className,
  showLabel = true,
}: SupplierOriginBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
        isDomestic
          ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20'
          : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20',
        className,
      )}
    >
      <span aria-hidden>{flagEmoji(country)}</span>
      {showLabel && <span>{isDomestic ? 'Domestic' : 'International'}</span>}
    </span>
  )
}
