export type RFQStatus = 'open' | 'bids_received' | 'awarded' | 'closed'

export const MATERIAL_CATEGORIES = [
  { value: 'concrete', label: 'Concrete' },
  { value: 'steel', label: 'Structural Steel' },
  { value: 'lumber', label: 'Lumber & Wood' },
  { value: 'hvac', label: 'HVAC Equipment' },
  { value: 'electrical', label: 'Electrical Components' },
  { value: 'plumbing', label: 'Plumbing Materials' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'flooring', label: 'Flooring' },
  { value: 'insulation', label: 'Insulation' },
] as const

export const MATERIAL_UNITS = [
  { value: 'cubic_yards', label: 'Cubic Yards (cy)' },
  { value: 'tons', label: 'Tons (t)' },
  { value: 'board_feet', label: 'Board Feet (bf)' },
  { value: 'linear_feet', label: 'Linear Feet (lf)' },
  { value: 'square_feet', label: 'Square Feet (sf)' },
  { value: 'each', label: 'Each (ea)' },
  { value: 'gallons', label: 'Gallons (gal)' },
  { value: 'lbs', label: 'Pounds (lbs)' },
] as const

export const CERTIFICATION_OPTIONS = [
  'ASTM A36',
  'ASTM C150',
  'ASTM A615',
  'ASTM E119',
  'ISO 9001',
  'ISO 14001',
  'UL Listed',
  'FM Approved',
  'ICC Certified',
] as const

export interface CreateRFQRequest {
  material_name: string
  category: string
  quantity: number
  unit: string
  specs: string
  certifications_required: string[]
  delivery_date: string
  delivery_location: string
  budget_min?: number
  budget_max?: number
  accepts_international: boolean
}

export interface RFQ extends CreateRFQRequest {
  id: string
  status: RFQStatus
  posted_by: string
  created_at: string
  bid_count: number
}

// Wizard step state
export interface RFQFormData {
  // Step 1
  material_name: string
  category: string
  specs: string
  // Step 2
  quantity: string
  unit: string
  certifications_required: string[]
  // Step 3
  delivery_date: string
  delivery_location: string
  // Step 4
  budget_min: string
  budget_max: string
  accepts_international: boolean
}

export const RFQ_FORM_DEFAULTS: RFQFormData = {
  material_name: '',
  category: '',
  specs: '',
  quantity: '',
  unit: 'tons',
  certifications_required: [],
  delivery_date: '',
  delivery_location: '',
  budget_min: '',
  budget_max: '',
  accepts_international: false,
}
