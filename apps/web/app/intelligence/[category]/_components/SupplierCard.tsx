import { RiskBadge } from '@/components/shared/RiskBadge'
import { ReliabilityScore } from '@/components/shared/ReliabilityScore'
import { SupplierOriginBadge } from '@/components/shared/SupplierOriginBadge'
import { CertList } from '@/components/shared/CertBadge'
import { cn } from '@/lib/utils'
import type { SupplierIntelligence } from '@/lib/types/supplier'

interface Props {
  supplier: SupplierIntelligence
  rfqId?: string
}

export function SupplierCard({ supplier, rfqId }: Props) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-4 shadow-sm',
        supplier.is_alternative_international
          ? 'border-amber-300 ring-1 ring-amber-200'
          : 'border-gray-200',
      )}
    >
      {/* International alternative banner */}
      {supplier.is_alternative_international && (
        <div className="-mx-4 -mt-4 mb-3 flex items-center gap-1.5 rounded-t-lg bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-700">
          <span>🌐</span>
          <span>International Alternative - recommended when domestic supply is at risk</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        {/* Left: name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{supplier.name}</h3>
            <SupplierOriginBadge country={supplier.hq_country} isDomestic={supplier.is_domestic} />
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {supplier.hq_city}, {supplier.hq_country} · Origin: {supplier.origin_region}
          </p>
        </div>

        {/* Right: scores */}
        <div className="flex flex-shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-gray-400">Reliability</p>
            <ReliabilityScore score={supplier.reliability_score} />
          </div>
          <RiskBadge level={supplier.risk_level} />
        </div>
      </div>

      {/* Supply route */}
      <p className="mt-2.5 text-xs leading-relaxed text-gray-600">
        {supplier.supply_route_description}
      </p>

      {/* Risk notes */}
      {supplier.risk_notes && (
        <div className={cn(
          'mt-2 rounded px-2.5 py-1.5 text-xs',
          supplier.risk_level === 'high'
            ? 'bg-red-50 text-red-700'
            : 'bg-amber-50 text-amber-700',
        )}>
          ⚠ {supplier.risk_notes}
        </div>
      )}

      {/* Certifications + CTA */}
      <div className="mt-3 flex items-center justify-between gap-4">
        <CertList certs={supplier.certifications} max={4} />

        {rfqId ? (
          <button className="flex-shrink-0 rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700">
            Invite to Quote
          </button>
        ) : (
          <button
            disabled
            title="Post an RFQ to invite this supplier"
            className="flex-shrink-0 cursor-not-allowed rounded border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-400"
          >
            Invite to Quote
          </button>
        )}
      </div>
    </div>
  )
}
