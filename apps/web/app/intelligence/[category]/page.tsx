import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/layout/AppShell'
import { getIntelligenceReport } from '@/lib/api/intelligence'
import { formatDate } from '@/lib/utils'
import { SupplierCard } from './_components/SupplierCard'
import { NewsFeedSidebar } from './_components/NewsFeedSidebar'
import { SupplyRouteMap } from './_components/SupplyRouteMap'

interface Props {
  params: Promise<{ category: string }>
  searchParams: Promise<{ rfqId?: string }>
}

const CATEGORY_LABELS: Record<string, string> = {
  concrete: 'Concrete',
  steel: 'Structural Steel',
  lumber: 'Lumber & Wood',
}

export async function generateMetadata({ params }: Props) {
  const { category } = await params
  const label = CATEGORY_LABELS[category] ?? category
  return { title: `${label} Supply Chain Intelligence - Rialto` }
}

export default async function IntelligencePage({ params, searchParams }: Props) {
  const { category } = await params
  const { rfqId } = await searchParams

  const report = await getIntelligenceReport(category)
  if (!report) notFound()

  const label = CATEGORY_LABELS[category] ?? category

  const trendColor =
    report.commodity_price?.trend === 'up'
      ? 'text-red-600'
      : report.commodity_price?.trend === 'down'
        ? 'text-green-600'
        : 'text-gray-600'

  const trendArrow =
    report.commodity_price?.trend === 'up' ? '↑' : report.commodity_price?.trend === 'down' ? '↓' : '→'

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Link href="/rfq/new" className="hover:text-gray-700">RFQs</Link>
              <span>›</span>
              <span className="text-gray-900 font-medium">{label} Intelligence</span>
            </div>
            <h1 className="mt-1 text-xl font-semibold text-gray-900">
              {label} - Supply Chain Intelligence
            </h1>
            <p className="mt-0.5 text-xs text-gray-400">
              AI analysis updated {formatDate(report.generated_at)} · Data from public market sources
            </p>
          </div>

          {/* Commodity price widget */}
          {report.commodity_price && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-right shadow-sm">
              <p className="text-xs font-medium text-gray-500">{report.commodity_price.label}</p>
              <p className="text-lg font-bold text-gray-900">
                ${report.commodity_price.current.toLocaleString()}
                <span className="ml-1 text-xs font-normal text-gray-400">
                  / {report.commodity_price.unit}
                </span>
              </p>
              <p className={`text-xs font-medium ${trendColor}`}>
                {trendArrow} {report.commodity_price.trend_pct.toFixed(1)}% vs prior period
              </p>
            </div>
          )}
        </div>

        {/* AI summary */}
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <span>⚡</span> AI Supply Chain Analysis
          </p>
          <p className="leading-relaxed">{report.summary}</p>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-5">
          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Supply route map */}
            <SupplyRouteMap mapUrl={report.supply_route_map_url} category={label} />

            {/* RFQ context banner */}
            {rfqId && (
              <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5">
                <p className="text-sm text-blue-800">
                  <span className="font-medium">RFQ posted.</span> Use "Invite to Quote" to notify specific suppliers below.
                </p>
                <Link
                  href={`/rfq/${rfqId}/bids`}
                  className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  View Quotes →
                </Link>
              </div>
            )}

            {/* Supplier grid */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">
                  Recommended Suppliers
                  <span className="ml-1.5 text-gray-400 font-normal">
                    ({report.suppliers.length})
                  </span>
                </h2>
                <p className="text-xs text-gray-400">Sorted by reliability score</p>
              </div>
              <div className="space-y-3">
                {report.suppliers
                  .slice()
                  .sort((a, b) => b.reliability_score - a.reliability_score)
                  .map((supplier) => (
                    <SupplierCard key={supplier.id} supplier={supplier} rfqId={rfqId} />
                  ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-80 flex-shrink-0">
            <NewsFeedSidebar items={report.news_items} category={label} />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
