import Link from 'next/link'
import { FileUp } from 'lucide-react'

interface Props {
  projectId: string
  variant?: 'primary' | 'empty'
}

export function ExternalQuoteImportButton({ projectId, variant = 'primary' }: Props) {
  const style = variant === 'empty'
    ? { background: '#ffffff', color: '#2d6a4f', border: '1px solid #a8d5ba' }
    : { background: 'rgba(255,255,255,0.08)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)' }

  return (
    <Link
      href={`/contractor/projects/${projectId}/rfqs/import`}
      className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors"
      style={style}
    >
      <FileUp className="h-4 w-4" />
      Import Vendor Quotes
    </Link>
  )
}
