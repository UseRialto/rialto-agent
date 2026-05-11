import type {
  CommodityWatch,
  ProcurementRequirement,
  ProcurementLineItemAttribute,
  RequestRiskFlag,
  VendorCapabilityTag,
} from '@/lib/types/procurement'

export const PROCUREMENT_REQUIREMENT_OPTIONS: ProcurementRequirement[] = [
  { code: 'dvbe', label: 'California DVBE', type: 'diversity', verification: 'verified' },
  { code: 'sb', label: 'California Small Business', type: 'diversity', verification: 'verified' },
  { code: 'wosb', label: 'Women-Owned Small Business', type: 'diversity', verification: 'verified' },
  { code: 'minority_owned', label: 'Minority-Owned', type: 'diversity', verification: 'self_reported' },
  { code: 'women_owned', label: 'Women-Owned', type: 'diversity', verification: 'self_reported' },
  { code: 'made_in_usa', label: 'Made in USA', type: 'domestic', verification: 'project_rule' },
  { code: 'buy_america', label: 'Buy America / BABA', type: 'domestic', verification: 'project_rule' },
  { code: 'union_required', label: 'Union Labor Required', type: 'labor', verification: 'project_rule' },
  { code: 'non_union_preferred', label: 'Non-Union Preferred', type: 'labor', verification: 'project_rule' },
  { code: 'nda_required', label: 'NDA Required', type: 'confidentiality', verification: 'project_rule' },
]

export const VENDOR_CAPABILITY_TAGS: VendorCapabilityTag[] =
  PROCUREMENT_REQUIREMENT_OPTIONS.map(({ code, label, verification }) => ({ code, label, verification }))

export type MaterialAttributeProfile =
  | 'general'
  | 'steel'
  | 'concrete'
  | 'lumber'
  | 'glazing'
  | 'mep'
  | 'roofing'
  | 'cladding'

export type UnitOptionGroup = {
  label: string
  options: Array<{ value: string; label: string }>
}

const COMMON_ATTRIBUTES: ProcurementLineItemAttribute[] = [
  { key: 'material_family', label: 'Material Family', value: '', group: 'common' },
  { key: 'manufacturer', label: 'Manufacturer / Brand', value: '', group: 'common' },
  { key: 'standard', label: 'Standard / Specification', value: '', group: 'common' },
  { key: 'finish', label: 'Finish / Surface Treatment', value: '', group: 'common' },
  { key: 'origin', label: 'Country / Domestic Source', value: '', group: 'common' },
]

const PROFILE_ATTRIBUTES: Record<MaterialAttributeProfile, ProcurementLineItemAttribute[]> = {
  general: [
    { key: 'size_or_nominal', label: 'Size / Nominal', value: '', group: 'general' },
    { key: 'packaging', label: 'Packaging / Bundle', value: '', group: 'general' },
    { key: 'submittal_required', label: 'Submittal / Data Sheet', value: '', group: 'general' },
  ],
  steel: [
    { key: 'shape_profile', label: 'Shape / Profile', value: '', group: 'steel' },
    { key: 'grade', label: 'Grade', value: '', group: 'steel' },
    { key: 'coating', label: 'Primer / Galvanized Coating', value: '', group: 'steel' },
    { key: 'length', label: 'Length / Cut Length', value: '', group: 'steel' },
    { key: 'fabrication_notes', label: 'Fabrication Notes', value: '', group: 'steel' },
  ],
  concrete: [
    { key: 'mix_design', label: 'Mix Design / PSI', value: '', group: 'concrete' },
    { key: 'slump_air', label: 'Slump / Air Content', value: '', group: 'concrete' },
    { key: 'reinforcement', label: 'Reinforcement / Fiber', value: '', group: 'concrete' },
    { key: 'placement_method', label: 'Placement Method', value: '', group: 'concrete' },
    { key: 'curing_or_finish', label: 'Finish / Cure Requirement', value: '', group: 'concrete' },
  ],
  lumber: [
    { key: 'species_grade', label: 'Species / Grade', value: '', group: 'lumber' },
    { key: 'nominal_size', label: 'Nominal Size', value: '', group: 'lumber' },
    { key: 'treatment', label: 'Treatment / Fire Rating', value: '', group: 'lumber' },
    { key: 'moisture_or_appearance', label: 'Moisture / Appearance', value: '', group: 'lumber' },
  ],
  glazing: [
    { key: 'glass_makeup', label: 'Glass Makeup', value: '', group: 'glazing' },
    { key: 'performance', label: 'U-Value / SHGC / VT', value: '', group: 'glazing' },
    { key: 'frame_finish', label: 'Frame Finish', value: '', group: 'glazing' },
    { key: 'system_depth', label: 'System Depth / Bite', value: '', group: 'glazing' },
  ],
  mep: [
    { key: 'system_service', label: 'System / Service', value: '', group: 'mep' },
    { key: 'pressure_rating', label: 'Pressure / Schedule Rating', value: '', group: 'mep' },
    { key: 'insulation', label: 'Insulation / Lining', value: '', group: 'mep' },
    { key: 'connection_type', label: 'Connection / Fitting Type', value: '', group: 'mep' },
  ],
  roofing: [
    { key: 'membrane_type', label: 'Membrane / Roof Type', value: '', group: 'roofing' },
    { key: 'thickness', label: 'Thickness / Mil', value: '', group: 'roofing' },
    { key: 'insulation_r_value', label: 'Insulation / R-Value', value: '', group: 'roofing' },
    { key: 'warranty_target', label: 'Warranty Target', value: '', group: 'roofing' },
  ],
  cladding: [
    { key: 'panel_profile', label: 'Panel / Profile', value: '', group: 'cladding' },
    { key: 'color', label: 'Color', value: '', group: 'cladding' },
    { key: 'coating_system', label: 'Coating System', value: '', group: 'cladding' },
    { key: 'attachment_system', label: 'Attachment / Subgirt System', value: '', group: 'cladding' },
    { key: 'warranty_target', label: 'Warranty Target', value: '', group: 'cladding' },
  ],
}

export const UNIT_OPTION_GROUPS: UnitOptionGroup[] = [
  {
    label: 'Weight',
    options: [
      { value: 'tons', label: 'tons' },
      { value: 'lbs', label: 'lbs' },
      { value: 'kg', label: 'kg' },
    ],
  },
  {
    label: 'Count / Assemblies',
    options: [
      { value: 'ea', label: 'each' },
      { value: 'set', label: 'set' },
      { value: 'assy', label: 'assembly' },
      { value: 'pcs', label: 'pieces' },
      { value: 'doors', label: 'doors / openings' },
    ],
  },
  {
    label: 'Length',
    options: [
      { value: 'lf', label: 'linear feet' },
      { value: 'ft', label: 'feet' },
      { value: 'in', label: 'inches' },
    ],
  },
  {
    label: 'Area',
    options: [
      { value: 'sf', label: 'square feet' },
      { value: 'sy', label: 'square yards' },
    ],
  },
  {
    label: 'Volume',
    options: [
      { value: 'cy', label: 'cubic yards' },
      { value: 'cf', label: 'cubic feet' },
      { value: 'gal', label: 'gallons' },
    ],
  },
  {
    label: 'Packaging',
    options: [
      { value: 'bundle', label: 'bundle' },
      { value: 'box', label: 'box' },
      { value: 'bag', label: 'bag' },
      { value: 'roll', label: 'roll' },
      { value: 'pallet', label: 'pallet' },
      { value: 'sheets', label: 'sheets' },
    ],
  },
]

export const DEFAULT_LINE_ITEM_ATTRIBUTES: ProcurementLineItemAttribute[] = [
  ...COMMON_ATTRIBUTES,
  ...PROFILE_ATTRIBUTES.general,
]

const ATTRIBUTE_SELECT_OPTIONS: Record<string, string[]> = {
  material_family: ['Structural steel', 'Concrete', 'Lumber', 'Glazing', 'Roofing', 'HVAC equipment', 'Cladding'],
  standard: ['ASTM A36', 'ASTM A500', 'ASTM A615', 'ASTM A653', 'ASTM A706', 'ASTM A992', 'ASTM C94', 'AAMA 2605', 'UL listed'],
  finish: ['Mill finish', 'Shop primed', 'Hot-dip galvanized', 'Powder coated', 'Painted'],
  origin: ['Domestic', 'Imported', 'Made in USA', 'Buy America compliant'],
  shape_profile: ['W-beam', 'HSS', 'Angle', 'Channel', 'Plate'],
  grade: ['Grade 36', 'Grade 50', 'ASTM A992', 'ASTM A615 Grade 60', 'ASTM A706'],
  coating: ['Shop primed', 'Galvanized', 'Epoxy coated', 'Bare steel'],
  fabrication_notes: ['Field verify dimensions', 'Shop weld and ship loose', 'Camber required'],
  mix_design: ['3000 PSI', '4000 PSI', '5000 PSI', 'Lightweight concrete'],
  slump_air: ['4 in slump', '5 in slump', '5-7% air', 'Non-air entrained'],
  reinforcement: ['Fiber reinforced', 'Rebar reinforced', 'WWR', 'No reinforcement'],
  placement_method: ['Pump', 'Tailgate', 'Shotcrete'],
  species_grade: ['DF No. 1', 'DF No. 2', 'LVL', 'Glulam'],
  treatment: ['Pressure treated', 'Fire treated', 'Untreated'],
  glass_makeup: ['1" IGU low-e', 'Laminated', 'Tempered', 'Spandrel'],
  performance: ['U-0.29 max', 'SHGC 0.25 max', 'Fire rated', 'Acoustical'],
  frame_finish: ['Clear anodized', 'Bronze anodized', 'Black painted'],
  system_service: ['Supply air', 'Return air', 'Chilled water', 'Domestic water', 'Power distribution'],
  pressure_rating: ['Schedule 40', 'Schedule 80', '150 psi', '300 psi'],
  insulation: ['No insulation', '1 in insulation', '2 in insulation', 'Lined'],
  membrane_type: ['TPO', 'PVC', 'EPDM', 'Modified bitumen'],
  thickness: ['45 mil', '60 mil', '80 mil'],
  insulation_r_value: ['R-20', 'R-30', 'R-38'],
  warranty_target: ['10-year', '15-year', '20-year', 'NDL'],
  panel_profile: ['Flat panel', 'Corrugated', 'Ribbed', 'ACM'],
  color: ['Black', 'White', 'Silver', 'Bronze', 'Custom color'],
  coating_system: ['PVDF', 'SMP', 'Anodized'],
}

export function cloneAttributes(attributes: ProcurementLineItemAttribute[]) {
  return attributes.map((attribute) => ({ ...attribute }))
}

export function deriveMaterialAttributeProfile(category?: string) {
  const normalized = (category ?? '').toLowerCase()
  if (!normalized) return 'general' as const
  if (normalized.includes('steel') || normalized.includes('rebar') || normalized.includes('post-tension')) return 'steel' as const
  if (normalized.includes('concrete') || normalized.includes('masonry')) return 'concrete' as const
  if (normalized.includes('lumber') || normalized.includes('wood') || normalized.includes('timber')) return 'lumber' as const
  if (normalized.includes('glass') || normalized.includes('glaz')) return 'glazing' as const
  if (normalized.includes('mep') || normalized.includes('duct') || normalized.includes('pipe') || normalized.includes('hvac') || normalized.includes('electrical')) return 'mep' as const
  if (normalized.includes('roof')) return 'roofing' as const
  if (normalized.includes('clad') || normalized.includes('panel') || normalized.includes('acm')) return 'cladding' as const
  return 'general' as const
}

export function buildLineItemAttributes(category?: string, existing?: ProcurementLineItemAttribute[]) {
  const profile = deriveMaterialAttributeProfile(category)
  const visibleTemplate = [...COMMON_ATTRIBUTES, ...PROFILE_ATTRIBUTES[profile]]
  const existingMap = new Map((existing ?? []).map((attribute) => [attribute.key, attribute.value]))
  return visibleTemplate.map((attribute) => ({
    ...attribute,
    value: existingMap.get(attribute.key) ?? '',
  }))
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function tokenizeSpecs(specs?: string) {
  return (specs ?? '')
    .split(/\s*[;,|]\s*|\n+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function addRegexMatches(values: string[], specs: string, regex: RegExp) {
  for (const match of specs.matchAll(regex)) {
    if (match[0]) values.push(match[0].trim())
  }
}

export function getLineItemAttributeOptions(
  category: string | undefined,
  attributeKey: string,
  specs?: string,
  currentValue?: string,
) {
  const profile = deriveMaterialAttributeProfile(category)
  const base = [...(ATTRIBUTE_SELECT_OPTIONS[attributeKey] ?? [])]
  const candidates: string[] = []
  const rawSpecs = specs ?? ''
  const tokens = tokenizeSpecs(rawSpecs)

  if (attributeKey === 'standard' || attributeKey === 'grade') addRegexMatches(candidates, rawSpecs, /\bASTM\s+[A-Z]?\d+[A-Z0-9-]*\b/gi)
  if (attributeKey === 'grade') addRegexMatches(candidates, rawSpecs, /\bGrade\s+\d+\b/gi)
  if (attributeKey === 'mix_design') addRegexMatches(candidates, rawSpecs, /\b\d{3,5}\s*PSI\b/gi)
  if (attributeKey === 'shape_profile') addRegexMatches(candidates, rawSpecs, /\b(?:W\d+[xX]\d+|HSS\s*\d+[xX]\d+(?:[xX]\d+\/\d+)?|Plate|Angle|Channel)\b/gi)
  if (attributeKey === 'performance') addRegexMatches(candidates, rawSpecs, /\b(?:U-\d+(?:\.\d+)?|SHGC\s*\d+(?:\.\d+)?|Fire rated|Acoustical)\b/gi)
  if (attributeKey === 'coating' || attributeKey === 'coating_system' || attributeKey === 'finish') {
    tokens
      .filter((token) => /(galv|primer|paint|pvdf|anodized|epoxy|coat|finish)/i.test(token))
      .forEach((token) => candidates.push(token))
  }

  if (profile === 'concrete' && attributeKey === 'placement_method') {
    tokens.filter((token) => /(pump|shotcrete|tailgate)/i.test(token)).forEach((token) => candidates.push(token))
  }

  return unique([...base, ...candidates, currentValue ?? ''])
}

export function summarizeLineItemAttributes(attributes?: ProcurementLineItemAttribute[]) {
  return (attributes ?? [])
    .filter((attribute) => attribute.value.trim())
    .map((attribute) => `${attribute.label}: ${attribute.value.trim()}`)
    .join('; ')
}

export function extractAdditionalSpecNotes(specs?: string) {
  const text = (specs ?? '').trim()
  const marker = ' | Additional: '
  const markerIndex = text.indexOf(marker)
  if (markerIndex === -1) return text
  return text.slice(markerIndex + marker.length).trim()
}

export function composeLineItemSpecs(attributes?: ProcurementLineItemAttribute[], additionalNotes?: string) {
  const structured = summarizeLineItemAttributes(attributes)
  const notes = (additionalNotes ?? '').trim()
  if (structured && notes) return `${structured} | Additional: ${notes}`
  return structured || notes
}

export function inferAttributesFromSpecs(
  specs: string,
  category?: string,
  existing?: ProcurementLineItemAttribute[],
) {
  const next = buildLineItemAttributes(category, existing)
  const raw = specs.trim()
  if (!raw) return next

  const updates: Record<string, string> = {}
  const standardMatch = raw.match(/\bASTM\s+[A-Z]?\d+[A-Z0-9-]*\b/i)
  if (standardMatch) updates.standard = standardMatch[0]
  const gradeMatch = raw.match(/\bGrade\s+\d+\b/i)
  if (gradeMatch) updates.grade = gradeMatch[0]
  const psiMatch = raw.match(/\b\d{3,5}\s*PSI\b/i)
  if (psiMatch) updates.mix_design = psiMatch[0]
  const shapeMatch = raw.match(/\b(?:W\d+[xX]\d+|HSS\s*\d+[xX]\d+(?:[xX]\d+\/\d+)?|Plate|Angle|Channel)\b/i)
  if (shapeMatch) updates.shape_profile = shapeMatch[0]
  const performanceMatch = raw.match(/\b(?:U-\d+(?:\.\d+)?|SHGC\s*\d+(?:\.\d+)?|Fire rated|Acoustical)\b/i)
  if (performanceMatch) updates.performance = performanceMatch[0]

  for (const token of tokenizeSpecs(raw)) {
    if (!updates.coating && /(galv|primer|epoxy)/i.test(token)) updates.coating = token
    if (!updates.finish && /(finish|paint|anodized)/i.test(token)) updates.finish = token
    if (!updates.coating_system && /(pvdf|smp|anodized)/i.test(token)) updates.coating_system = token
    if (!updates.membrane_type && /\b(tpo|pvc|epdm)\b/i.test(token)) updates.membrane_type = token
    if (!updates.pressure_rating && /(schedule|psi)/i.test(token)) updates.pressure_rating = token
    if (!updates.placement_method && /(pump|shotcrete|tailgate)/i.test(token)) updates.placement_method = token
    if (!updates.color && /\b(black|white|silver|bronze)\b/i.test(token)) updates.color = token
  }

  return next.map((attribute) => ({
    ...attribute,
    value: updates[attribute.key] ?? attribute.value,
  }))
}

export function deriveCommodityWatch(category?: string): CommodityWatch[] {
  const normalized = (category ?? '').toLowerCase()
  if (normalized.includes('steel') || normalized.includes('rebar') || normalized.includes('metal')) {
    return [
      {
        category: 'steel',
        risk_level: 'medium',
        summary: 'Steel packages can be affected by union labor changes, port congestion, and overseas mill lead times.',
      },
    ]
  }
  if (normalized.includes('aluminum')) {
    return [
      {
        category: 'aluminum',
        risk_level: 'high',
        summary: 'Aluminum pricing is volatile and often sensitive to global sourcing, tariffs, and fabrication lead times.',
      },
    ]
  }
  if (normalized.includes('copper')) {
    return [
      {
        category: 'copper',
        risk_level: 'high',
        summary: 'Copper packages can move quickly on commodity swings and may require tighter quote validity windows.',
      },
    ]
  }
  return []
}

export function deriveRequestRiskFlags(category?: string, requirements: ProcurementRequirement[] = []): RequestRiskFlag[] {
  const flags: RequestRiskFlag[] = []
  const normalized = (category ?? '').toLowerCase()
  if (normalized.includes('steel') || normalized.includes('aluminum') || normalized.includes('copper')) {
    flags.push({ code: 'commodity_volatility', label: 'Commodity volatility', severity: 'medium' })
  }
  if (requirements.some((req) => req.code === 'buy_america' || req.code === 'made_in_usa')) {
    flags.push({ code: 'domestic_sourcing', label: 'Domestic sourcing constraint', severity: 'medium' })
  }
  if (requirements.some((req) => req.code === 'union_required')) {
    flags.push({ code: 'union_labor', label: 'Union labor requirement', severity: 'medium' })
  }
  return flags
}
