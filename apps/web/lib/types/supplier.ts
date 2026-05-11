export type RiskLevel = 'low' | 'medium' | 'high'

export interface SupplierSummary {
  id: string
  name: string
  hq_country: string
  hq_city: string
  is_domestic: boolean
  origin_region: string
  reliability_score: number // 0.0–10.0
  risk_level: RiskLevel
  risk_notes?: string
}

export interface SupplierIntelligence {
  id: string
  name: string
  hq_country: string
  hq_city: string
  is_domestic: boolean
  origin_country: string
  origin_region: string
  supply_route_description: string
  reliability_score: number
  risk_level: RiskLevel
  risk_notes?: string
  certifications: string[]
  is_alternative_international: boolean
}
