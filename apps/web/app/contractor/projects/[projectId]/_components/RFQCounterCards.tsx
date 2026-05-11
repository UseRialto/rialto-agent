import { CheckCircle2, ClipboardList, FileClock, Radio } from 'lucide-react'

interface Props {
  counts: { total: number; pending: number; active: number; awarded: number }
}

type CardConfig = { label: string; value: number; color: string; bg: string; border: string; description?: string; icon: React.ComponentType<{ className?: string }> }

export function RFQCounterCards({ counts }: Props) {
  const cards: CardConfig[] = [
    {
      label: 'Total RFQs',
      value: counts.total,
      color: '#1e3a2f',
      bg: '#ffffff',
      border: '#e2d9cf',
      icon: ClipboardList,
    },
    {
      label: 'Drafts',
      value: counts.pending,
      color: '#a85c2a',
      bg: '#fdf0e8',
      border: '#e8c4a0',
      description: 'Not yet published',
      icon: FileClock,
    },
    {
      label: 'Active',
      value: counts.active,
      color: '#2d6a4f',
      bg: '#e8f4ee',
      border: '#a8d5ba',
      description: 'Published - accepting quotes',
      icon: Radio,
    },
    {
      label: 'Awarded',
      value: counts.awarded,
      color: '#1e3a2f',
      bg: '#e8f4ee',
      border: '#a8d5ba',
      description: 'PO issued',
      icon: CheckCircle2,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
        <div
          key={card.label}
          className="rounded-2xl p-5"
          style={{ background: card.bg, border: `1px solid ${card.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-3xl font-semibold tracking-tight" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: card.color }}>{card.value}</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: '#4a6358' }}>{card.label}</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(255,255,255,0.8)', color: card.color }}>
              <Icon className="h-[18px] w-[18px]" />
            </span>
          </div>
          {card.description && (
            <p className="mt-3 text-xs font-medium" style={{ color: '#8a9e96' }}>{card.description}</p>
          )}
        </div>
      )})}
    </div>
  )
}
