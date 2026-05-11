import type { VendorResponseStatus } from '@/lib/types/vendor'

interface Props {
  status: VendorResponseStatus
}

const styles: Record<VendorResponseStatus, React.CSSProperties> = {
  not_started: { background: '#ede8e2', color: '#8a9e96' },
  draft: { background: '#fdf0e8', color: '#a85c2a' },
  submitted: { background: '#e8f4ee', color: '#2d6a4f' },
}

const labels: Record<VendorResponseStatus, string> = {
  not_started: 'Not Started',
  draft: 'Draft Saved',
  submitted: 'Submitted',
}

export function RFQStatusBadge({ status }: Props) {
  return (
    <span className="rounded px-2 py-0.5 text-xs font-medium" style={styles[status]}>
      {status === 'submitted' && '✓ '}{labels[status]}
    </span>
  )
}
