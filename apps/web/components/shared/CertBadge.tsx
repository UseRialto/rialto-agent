import { cn } from '@/lib/utils'

interface CertBadgeProps {
  cert: string
  className?: string
}

export function CertBadge({ cert, className }: CertBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/20',
        className,
      )}
    >
      {cert}
    </span>
  )
}

interface CertListProps {
  certs: string[]
  max?: number
  className?: string
}

export function CertList({ certs, max = 3, className }: CertListProps) {
  const visible = certs.slice(0, max)
  const overflow = certs.length - max

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {visible.map((c) => (
        <CertBadge key={c} cert={c} />
      ))}
      {overflow > 0 && (
        <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">
          +{overflow}
        </span>
      )}
    </div>
  )
}
