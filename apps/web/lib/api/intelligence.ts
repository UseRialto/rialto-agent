import type { IntelligenceReport } from '@/lib/types/intelligence'

// MVP: reads from static fixtures. In Phase 3, replace with API call.
export async function getIntelligenceReport(category: string): Promise<IntelligenceReport | null> {
  const supported = ['concrete', 'steel', 'lumber']
  if (!supported.includes(category)) return null

  const report = await import(`@/lib/fixtures/intelligence-${category}.json`)
  return report.default as IntelligenceReport
}
