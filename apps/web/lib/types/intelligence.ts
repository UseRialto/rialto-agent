import type { SupplierIntelligence, RiskLevel } from './supplier'

export interface CommodityPrice {
  label: string
  current: number
  unit: string
  trend: 'up' | 'down' | 'stable'
  trend_pct: number
}

export interface NewsItem {
  title: string
  url: string
  source: string
  published_at: string
  severity: RiskLevel
  affected_categories: string[]
}

export interface IntelligenceReport {
  category: string
  generated_at: string
  summary: string
  commodity_price?: CommodityPrice
  suppliers: SupplierIntelligence[]
  supply_route_map_url?: string
  news_items: NewsItem[]
}
