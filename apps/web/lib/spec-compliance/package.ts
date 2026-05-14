import type { RetrievedSpecChunk } from './types'

export type ProjectSpecPackageStatus = 'pending' | 'complete' | 'failed'

export interface ProjectSpecPackageChunkSelection {
  chunk: RetrievedSpecChunk
  reason: string
  score: number
}

export interface TradeScopedSpecPackageBuild {
  trade: string
  normalizedTrade: string
  title: string
  content: string
  selected: ProjectSpecPackageChunkSelection[]
  diagnostics: {
    source_chunk_count: number
    selected_chunk_count: number
    section_prefixes: string[]
    keywords: string[]
    reason_counts: Record<string, number>
  }
}

export type TradeProfile = {
  canonical: string
  aliases: string[]
  sectionPrefixes: string[]
  keywords: string[]
}

const COMMON_SPEC_PREFIXES = ['00', '01']
const COMMON_SPEC_KEYWORDS = [
  'alternate',
  'approved equal',
  'basis of design',
  'product data',
  'product requirements',
  'shop drawings',
  'submittal',
  'substitution',
]

const TRADE_PROFILES: TradeProfile[] = [
  {
    canonical: 'concrete',
    aliases: ['concrete', 'cast in place concrete', 'ready mix'],
    sectionPrefixes: ['03', '07', '32'],
    keywords: ['concrete', 'rebar', 'reinforcing', 'cast in place', 'joint sealant', 'slab'],
  },
  {
    canonical: 'structural_steel',
    aliases: ['structural steel', 'steel', 'metal fabrications', 'metals'],
    sectionPrefixes: ['05'],
    keywords: ['steel', 'metal fabrication', 'decking', 'anchor bolt', 'w shape', 'hss'],
  },
  {
    canonical: 'masonry',
    aliases: ['masonry', 'unit masonry', 'cmu', 'brick'],
    sectionPrefixes: ['04'],
    keywords: ['masonry', 'cmu', 'brick', 'mortar', 'grout'],
  },
  {
    canonical: 'roofing_waterproofing',
    aliases: ['roofing', 'waterproofing', 'building envelope'],
    sectionPrefixes: ['07'],
    keywords: ['roofing', 'waterproofing', 'membrane', 'flashing', 'insulation'],
  },
  {
    canonical: 'openings_hardware',
    aliases: ['openings', 'doors', 'hardware', 'glazing'],
    sectionPrefixes: ['08'],
    keywords: ['door', 'frame', 'hardware', 'glazing', 'window', 'lockset'],
  },
  {
    canonical: 'flooring_finishes',
    aliases: ['flooring', 'finishes', 'acoustical ceilings', 'paint'],
    sectionPrefixes: ['09'],
    keywords: ['flooring', 'finish', 'ceiling', 'paint', 'tile', 'carpet', 'gypsum'],
  },
  {
    canonical: 'specialties',
    aliases: ['specialties', 'toilet accessories', 'fire protection cabinets'],
    sectionPrefixes: ['10'],
    keywords: ['specialties', 'accessories', 'markerboard', 'visual display', 'cabinet'],
  },
  {
    canonical: 'casework_countertops',
    aliases: ['casework', 'countertops', 'millwork'],
    sectionPrefixes: ['06', '12'],
    keywords: ['casework', 'countertop', 'laminate', 'solid surface', 'millwork'],
  },
  {
    canonical: 'fire_suppression',
    aliases: ['fire suppression', 'sprinkler'],
    sectionPrefixes: ['21'],
    keywords: ['sprinkler', 'fire suppression', 'standpipe', 'fire pump'],
  },
  {
    canonical: 'plumbing',
    aliases: ['plumbing', 'piping', 'fixtures'],
    sectionPrefixes: ['22'],
    keywords: ['plumbing', 'piping', 'fixture', 'valve', 'sanitary', 'domestic water'],
  },
  {
    canonical: 'hvac',
    aliases: ['hvac', 'mechanical', 'air distribution'],
    sectionPrefixes: ['23'],
    keywords: ['hvac', 'duct', 'air terminal', 'refrigerant', 'mechanical', 'insulation'],
  },
  {
    canonical: 'mechanical_equipment',
    aliases: ['mechanical equipment', 'mechanical'],
    sectionPrefixes: ['23'],
    keywords: ['mechanical equipment', 'air terminal', 'heating', 'cooling', 'hvac'],
  },
  {
    canonical: 'electrical_power',
    aliases: ['electrical', 'electrical power', 'power'],
    sectionPrefixes: ['26'],
    keywords: ['electrical', 'conductor', 'cable', 'panelboard', 'switchgear', 'grounding'],
  },
  {
    canonical: 'lighting_controls',
    aliases: ['lighting', 'lighting controls'],
    sectionPrefixes: ['26'],
    keywords: ['lighting', 'luminaire', 'led', 'controls', 'occupancy sensor'],
  },
  {
    canonical: 'communications',
    aliases: ['communications', 'data', 'low voltage', 'telecom'],
    sectionPrefixes: ['27'],
    keywords: ['communications', 'cabling', 'data', 'telecom', 'pathway'],
  },
  {
    canonical: 'fire_alarm_security',
    aliases: ['fire alarm', 'security', 'access control'],
    sectionPrefixes: ['28'],
    keywords: ['fire alarm', 'smoke detection', 'access control', 'security'],
  },
  {
    canonical: 'earthwork_utilities',
    aliases: ['earthwork', 'utilities', 'site utilities'],
    sectionPrefixes: ['31', '33'],
    keywords: ['earthwork', 'excavation', 'utility', 'water distribution', 'sewer'],
  },
  {
    canonical: 'sitework_paving',
    aliases: ['sitework', 'paving', 'landscaping'],
    sectionPrefixes: ['32'],
    keywords: ['paving', 'sitework', 'asphalt', 'turf', 'marking', 'landscape'],
  },
  {
    canonical: 'insulation_firestopping',
    aliases: ['insulation', 'firestopping', 'fire stopping'],
    sectionPrefixes: ['07', '23'],
    keywords: ['insulation', 'firestopping', 'fire stopping', 'joint sealant'],
  },
  {
    canonical: 'substitution_control',
    aliases: ['substitution control', 'substitutions', 'procurement substitutions'],
    sectionPrefixes: ['00', '01'],
    keywords: ['substitution', 'alternate', 'approved equal', 'product requirements', 'submittal'],
  },
]

function normalize(value: string) {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
}

function compact(value?: string | number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function canonicalSectionPrefix(sectionNumber?: string) {
  const digits = String(sectionNumber ?? '').replace(/[^0-9]/g, '')
  return digits.length >= 2 ? digits.slice(0, 2) : ''
}

function chunkText(chunk: RetrievedSpecChunk) {
  return [
    chunk.section_number,
    chunk.section_title,
    chunk.content,
  ].map(compact).filter(Boolean).join(' ')
}

export function normalizeContractorTrade(trade?: string) {
  const normalized = normalize(trade ?? '')
  if (!normalized) return 'general'
  const profile = TRADE_PROFILES.find((candidate) => (
    candidate.canonical === normalized.replace(/\s+/g, '_') ||
    candidate.aliases.some((alias) => normalize(alias) === normalized)
  ))
  return profile?.canonical ?? normalized.replace(/\s+/g, '_')
}

export function tradeSpecProfile(trade?: string): TradeProfile {
  const canonical = normalizeContractorTrade(trade)
  return TRADE_PROFILES.find((profile) => profile.canonical === canonical) ?? {
    canonical,
    aliases: [canonical.replace(/_/g, ' ')],
    sectionPrefixes: [],
    keywords: canonical.split('_').filter(Boolean),
  }
}

export function selectTradeScopedSpecChunks(chunks: RetrievedSpecChunk[], trade?: string): ProjectSpecPackageChunkSelection[] {
  const profile = tradeSpecProfile(trade)
  const prefixes = new Set([...profile.sectionPrefixes, ...COMMON_SPEC_PREFIXES])
  const tradeKeywords = profile.keywords.map(normalize).filter(Boolean)
  const commonKeywords = COMMON_SPEC_KEYWORDS.map(normalize).filter(Boolean)
  const keywords = [...tradeKeywords, ...commonKeywords]

  return chunks
    .map((chunk, originalIndex) => {
      const prefix = canonicalSectionPrefix(chunk.section_number ?? chunk.canonical_section_number)
      const text = normalize(chunkText(chunk))
      const tradeKeywordHits = tradeKeywords.filter((keyword) => text.includes(keyword))
      const commonKeywordHits = commonKeywords.filter((keyword) => text.includes(keyword))
      const keywordHits = [...tradeKeywordHits, ...commonKeywordHits]
      const sectionHit = prefix && prefixes.has(prefix)
      const tradeSectionHit = prefix && profile.sectionPrefixes.includes(prefix)
      const commonSubstitutionHit = COMMON_SPEC_PREFIXES.includes(prefix) && commonKeywordHits.length > 0
      const selected = Boolean(tradeSectionHit || commonSubstitutionHit || tradeKeywordHits.length >= 2)
      const score = (tradeSectionHit ? 80 : 0) + (sectionHit ? 12 : 0) + keywordHits.length * 8
      const reason = tradeSectionHit
        ? `section-prefix:${prefix}`
        : commonSubstitutionHit
          ? 'common-substitution-control'
          : keywordHits.length > 0
            ? `keyword:${keywordHits.slice(0, 3).join(',')}`
            : ''
      return { chunk, originalIndex, selected, reason, score }
    })
    .filter((entry) => entry.selected)
    .sort((a, b) => b.score - a.score || a.chunk.page_start - b.chunk.page_start || a.originalIndex - b.originalIndex)
    .map(({ chunk, reason, score }) => ({ chunk, reason, score }))
}

function sectionLabel(chunk: RetrievedSpecChunk) {
  return [
    chunk.section_number,
    chunk.section_title,
  ].map(compact).filter(Boolean).join(' ')
}

export function renderTradeScopedSpecPackage(trade: string, selected: ProjectSpecPackageChunkSelection[]) {
  const title = `${trade.replace(/_/g, ' ')} project spec package`
  const body = selected.map((entry, index) => {
    const chunk = entry.chunk
    return [
      `## Evidence ${index + 1}: ${chunk.document_name}, pages ${chunk.page_start}-${chunk.page_end}${sectionLabel(chunk) ? `, ${sectionLabel(chunk)}` : ''}`,
      `Selection reason: ${entry.reason}`,
      '',
      compact(chunk.content),
    ].join('\n')
  }).join('\n\n')
  return `# ${title}\n\n${body}`.trim()
}

export function buildTradeScopedSpecPackage(chunks: RetrievedSpecChunk[], trade?: string): TradeScopedSpecPackageBuild {
  const normalizedTrade = normalizeContractorTrade(trade)
  const profile = tradeSpecProfile(normalizedTrade)
  const selected = selectTradeScopedSpecChunks(chunks, normalizedTrade)
  const reasonCounts: Record<string, number> = {}
  for (const entry of selected) {
    reasonCounts[entry.reason] = (reasonCounts[entry.reason] ?? 0) + 1
  }
  const title = `${normalizedTrade.replace(/_/g, ' ')} project spec package`
  return {
    trade: trade ?? normalizedTrade,
    normalizedTrade,
    title,
    content: renderTradeScopedSpecPackage(normalizedTrade, selected),
    selected,
    diagnostics: {
      source_chunk_count: chunks.length,
      selected_chunk_count: selected.length,
      section_prefixes: [...new Set([...profile.sectionPrefixes, ...COMMON_SPEC_PREFIXES])],
      keywords: [...new Set([...profile.keywords, ...COMMON_SPEC_KEYWORDS])],
      reason_counts: reasonCounts,
    },
  }
}
