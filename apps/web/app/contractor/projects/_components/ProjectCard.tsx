import Link from 'next/link'
import { ArrowRight, CircleDollarSign, MapPin, RadioTower } from 'lucide-react'
import type { ContractorProject } from '@/lib/types/contractor'

interface Props {
  project: ContractorProject
  counts: { total: number; pending: number; active: number; awarded: number }
}

export function ProjectCard({ project, counts }: Props) {
  const statusStyle = project.status === 'active'
    ? { background: '#e8f4ee', color: '#2d6a4f', outline: '1px solid #a8d5ba' }
    : project.status === 'completed'
      ? { background: '#ede8e2', color: '#4a6358', outline: '1px solid #e2d9cf' }
      : { background: '#fdf0e8', color: '#a85c2a', outline: '1px solid #fdc89a' }

  return (
    <Link
      href={`/contractor/projects/${project.id}`}
      className="group flex min-h-80 flex-col overflow-hidden rounded-2xl transition-all hover:-translate-y-1 hover:shadow-xl"
      style={{ background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 12px 32px rgba(30,58,47,0.06)' }}
    >
      <div className="h-1.5" style={{ background: '#fa6b04' }} />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold tracking-tight transition-colors" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#1e3a2f' }}>
              {project.name}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: '#8a9e96' }}>
              <MapPin className="h-3.5 w-3.5" style={{ color: '#8a9e96' }} />
              {project.location}
            </p>
          </div>
          <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize" style={statusStyle}>
            {project.status}
          </span>
        </div>

        {project.description && (
          <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5" style={{ color: '#4a6358' }}>{project.description}</p>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { label: 'Drafts', value: counts.pending },
            { label: 'Active', value: counts.active },
            { label: 'Awarded', value: counts.awarded },
          ].map((metric) => (
            <div key={metric.label} className="rounded-lg px-2 py-2" style={{ background: '#ede8e2', border: '1px solid #d6cdc3' }}>
              <p className="truncate text-lg font-semibold leading-none" style={{ fontFamily: 'var(--font-lora, Georgia, serif)', color: '#4a6358' }}>{metric.value}</p>
              <p className="mt-1 truncate text-[11px] font-medium" style={{ color: '#4a6358' }}>{metric.label}</p>
            </div>
          ))}
        </div>

        {project.budget && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl p-3" style={{ background: '#e8f4ee', border: '1px solid #a8d5ba' }}>
              <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#4a6358' }}>
                <RadioTower className="h-3.5 w-3.5" style={{ color: '#2d6a4f' }} />
                General Contractor
              </p>
              <p className="mt-1 truncate text-sm font-semibold" style={{ color: '#1e3a2f' }}>{project.general_contractor ?? 'General Contractor'}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: '#ede8e2', border: '1px solid #e2d9cf' }}>
              <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#8a9e96' }}>
                <CircleDollarSign className="h-3.5 w-3.5" style={{ color: '#fa6b04' }} />
                Budget
              </p>
              <p className="mt-1 truncate text-sm font-semibold" style={{ color: '#1e3a2f' }}>${project.budget.toLocaleString()}</p>
            </div>
          </div>
        )}

        <div className="mt-auto pt-5">
          <div className="flex items-center justify-between border-t pt-4 text-xs font-semibold" style={{ borderColor: '#ede8e2', color: '#8a9e96' }}>
            <span>Created {new Date(project.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span className="inline-flex items-center gap-1 transition-colors group-hover:text-[#fa6b04]" style={{ color: '#4a6358' }}>
              Open project
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
