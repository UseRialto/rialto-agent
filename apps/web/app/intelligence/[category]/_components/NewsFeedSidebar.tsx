import { RiskBadge } from '@/components/shared/RiskBadge'
import { formatRelativeTime } from '@/lib/utils'
import type { NewsItem } from '@/lib/types/intelligence'

interface Props {
  items: NewsItem[]
  category: string
}

export function NewsFeedSidebar({ items, category }: Props) {
  const sorted = [...items].sort(
    (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-700">
          Supply Chain News
        </h2>
        <p className="text-xs text-gray-400">{category} · live feed</p>
      </div>

      <div className="divide-y divide-gray-100">
        {sorted.map((item, i) => (
          <a
            key={i}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium leading-snug text-gray-800 line-clamp-3">
                {item.title}
              </p>
              <RiskBadge level={item.severity} showFull={false} className="flex-shrink-0" />
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400">
              <span>{item.source}</span>
              <span>·</span>
              <span>{formatRelativeTime(item.published_at)}</span>
            </div>
          </a>
        ))}
      </div>

      <div className="border-t border-gray-100 px-4 py-2.5">
        <p className="text-xs text-gray-400 text-center">
          Filtered to {category.toLowerCase()} supply chain events
        </p>
      </div>
    </div>
  )
}
