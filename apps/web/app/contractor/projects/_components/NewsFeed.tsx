import newsData from '@/lib/fixtures/contractor-news.json'

const SEVERITY_STYLES = {
  high:   { dotColor: '#c0392b',  badgeBg: '#fdeaea', badgeText: '#c0392b', badgeBorder: '#f5c6c6' },
  medium: { dotColor: '#a85c2a',  badgeBg: '#fdf0e8', badgeText: '#a85c2a', badgeBorder: '#e8c4a0' },
  low:    { dotColor: '#2d6a4f',  badgeBg: '#e8f4ee', badgeText: '#2d6a4f', badgeBorder: '#a8d5ba' },
}

interface NewsItem {
  id: string
  title: string
  source: string
  published_at: string
  severity: 'high' | 'medium' | 'low'
  categories: string[]
  url: string
}

export function NewsFeed() {
  const items = newsData as NewsItem[]

  return (
    <div className="rounded-xl border bg-white shadow-sm" style={{ borderColor: '#e2d9cf' }}>
      <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: '#e2d9cf' }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>Supply Chain Intelligence</h2>
          <p className="text-xs" style={{ color: '#8a9e96' }}>Live market alerts affecting construction materials</p>
        </div>
        <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ background: '#e8f4ee', color: '#2d6a4f' }}>
          Live
        </span>
      </div>

      <ul className="divide-y" style={{ borderColor: '#ede8e2' }}>
        {items.map((item) => {
          const styles = SEVERITY_STYLES[item.severity]
          return (
            <li
              key={item.id}
              className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-[#ede8e2]"
            >
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: styles.dotColor }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug" style={{ color: '#1e3a2f' }}>{item.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs" style={{ color: '#8a9e96' }}>{item.source}</span>
                  <span className="text-xs" style={{ color: '#e2d9cf' }}>·</span>
                  <span className="text-xs" style={{ color: '#8a9e96' }}>{item.published_at}</span>
                  {item.categories.map((cat) => (
                    <span
                      key={cat}
                      className="rounded-full px-2 py-0.5 text-xs capitalize"
                      style={{ background: '#ede8e2', color: '#4a6358' }}
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium" style={{ background: styles.badgeBg, color: styles.badgeText, borderColor: styles.badgeBorder }}>
                {item.severity}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
