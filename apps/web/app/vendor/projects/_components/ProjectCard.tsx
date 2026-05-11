import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import type { Project } from '@/lib/types/vendor'

interface Props {
  project: Project
  href?: string
}

function isDueSoon(deadline?: string): boolean {
  if (!deadline) return false
  const daysUntil = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return daysUntil <= 7
}

export function ProjectCard({ project, href }: Props) {
  const dueSoon = isDueSoon(project.bid_deadline)
  const relevancePct = Math.round(project.relevance_score * 100)
  const barColor = relevancePct >= 80 ? '#2d6a4f' : relevancePct >= 50 ? '#fa6b04' : '#e2d9cf'

  return (
    <div className="rounded-2xl p-5 transition-shadow hover:shadow-md" style={{ background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold" style={{ color: '#1e3a2f' }}>{project.name}</h3>
          <p className="mt-0.5 text-xs" style={{ color: '#8a9e96' }}>{project.contractor_name}</p>
          {project.public_summary && (
            <p className="mt-1 text-xs" style={{ color: '#8a9e96' }}>{project.public_summary}</p>
          )}
          <p className="text-xs" style={{ color: '#8a9e96' }}>{project.location}</p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          {dueSoon && project.bid_deadline && (
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: '#fdf0e8', color: '#a85c2a' }}>
              Due {formatDate(project.bid_deadline)}
            </span>
          )}
          {!dueSoon && project.bid_deadline && (
            <span className="text-xs" style={{ color: '#8a9e96' }}>Due {formatDate(project.bid_deadline)}</span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs" style={{ color: '#8a9e96' }}>
            <span className="font-semibold" style={{ color: '#1e3a2f' }}>{project.relevant_rfq_count}</span>
            {' '}of {project.total_rfq_count} RFQs match your materials
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full" style={{ background: '#e2d9cf' }}>
              <div className="h-1.5 rounded-full" style={{ width: `${relevancePct}%`, background: barColor }} />
            </div>
            <span className="text-xs" style={{ color: '#8a9e96' }}>{relevancePct}% match</span>
          </div>
        </div>

        <Link
          href={href ?? `/vendor/projects/${project.id}`}
          className="flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition-colors"
          style={{ background: '#1e3a2f' }}
        >
          View Project →
        </Link>
      </div>
    </div>
  )
}
