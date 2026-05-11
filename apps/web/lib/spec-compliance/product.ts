import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { specProductLookupCache } from '@/lib/db/schema'
import type { ContractorBidLineItemResponse, ContractorRFQLineItem } from '@/lib/types/contractor'
import type { SpecProductLookupResult } from '@/lib/types/procurement'
import type { VendorProductProfile } from './types'

const DETAIL_TOKEN_RE = /\b(manufacturer|model|series|finish|dimension|diameter|radius|material|core|surface|substrate|thickness|size|color|mount|adhesive|voc|substitution)\b/i

function compact(value?: string | number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function parseLabeledValue(text: string, labels: string[]) {
  for (const label of labels) {
    const re = new RegExp(`\\b${label}\\s*[:#-]?\\s*([^,;\\n]+)`, 'i')
    const match = text.match(re)
    if (match?.[1]) return compact(match[1]).slice(0, 120)
  }
  return undefined
}

export function buildVendorProductProfile(
  lineItem: ContractorRFQLineItem,
  response: ContractorBidLineItemResponse,
): VendorProductProfile {
  const joined = [
    response.sku,
    response.description,
    response.quoted_product_details,
    response.substitution_notes,
    response.notes,
  ].map(compact).filter(Boolean).join(' | ')

  const manufacturer = parseLabeledValue(joined, ['manufacturer', 'mfr', 'make', 'brand'])
  const model = parseLabeledValue(joined, ['model', 'model no', 'model number', 'part', 'part no', 'part number'])
  const meaningfulDetail = DETAIL_TOKEN_RE.test(joined) || compact(response.quoted_product_details).length >= 40

  return {
    requested_sku: compact(lineItem.sku) || undefined,
    requested_description: compact(lineItem.description) || undefined,
    requested_specs: compact(lineItem.specs) || undefined,
    vendor_sku: compact(response.sku) || undefined,
    vendor_description: compact(response.description) || undefined,
    quoted_product_details: compact(response.quoted_product_details) || undefined,
    substitution_notes: compact(response.substitution_notes) || undefined,
    vendor_notes: compact(response.notes) || undefined,
    manufacturer,
    model,
    has_meaningful_vendor_detail: meaningfulDetail,
  }
}

function lookupKey(profile: VendorProductProfile) {
  const raw = [
    profile.vendor_sku,
    profile.manufacturer,
    profile.model,
    profile.vendor_description,
  ].map((value) => normalizeKey(value ?? '')).filter(Boolean).join('|')
  return raw || ''
}

function lookupQuery(profile: VendorProductProfile) {
  return [
    profile.vendor_sku,
    profile.manufacturer,
    profile.model,
    profile.vendor_description,
    profile.requested_description,
    'construction product specifications',
  ].map(compact).filter(Boolean).join(' ')
}

function parseResultJson(value: string | null | undefined): SpecProductLookupResult {
  if (!value) return { status: 'skipped' }
  try {
    return JSON.parse(value) as SpecProductLookupResult
  } catch {
    return { status: 'failed', error: 'Cached product lookup JSON could not be parsed.' }
  }
}

async function readCachedLookup(key: string): Promise<SpecProductLookupResult | undefined> {
  const row = (await db
    .select()
    .from(specProductLookupCache)
    .where(eq(specProductLookupCache.lookup_key, key)))[0]
  if (!row) return undefined
  return { ...parseResultJson(row.result_json), status: row.status as SpecProductLookupResult['status'], cached: true }
}

async function writeCachedLookup(
  key: string,
  profile: VendorProductProfile,
  result: SpecProductLookupResult,
) {
  const now = new Date().toISOString()
  await db
    .insert(specProductLookupCache)
    .values({
      lookup_key: key,
      vendor_sku: profile.vendor_sku ?? null,
      manufacturer: profile.manufacturer ?? null,
      model: profile.model ?? null,
      provider: result.provider ?? null,
      status: result.status,
      query: result.query ?? null,
      result_json: JSON.stringify(result),
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: specProductLookupCache.lookup_key,
      set: {
        provider: result.provider ?? null,
        status: result.status,
        query: result.query ?? null,
        result_json: JSON.stringify(result),
        updated_at: now,
      },
    })
}

async function tavilyLookup(query: string, apiKey: string): Promise<SpecProductLookupResult> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: 5,
      search_depth: 'basic',
      include_answer: true,
    }),
  })
  if (!response.ok) {
    return { status: 'failed', provider: 'tavily', query, error: `Tavily lookup failed with ${response.status}.` }
  }
  const json = await response.json() as {
    answer?: string
    results?: Array<{ title?: string; url?: string; content?: string }>
  }
  const results = (json.results ?? []).map((item) => ({
    title: compact(item.title) || 'Product result',
    url: compact(item.url) || undefined,
    snippet: compact(item.content).slice(0, 500) || undefined,
  }))
  return {
    status: results.length > 0 || json.answer ? 'found' : 'not_found',
    provider: 'tavily',
    query,
    summary: compact(json.answer).slice(0, 900) || undefined,
    results,
  }
}

async function serpApiLookup(query: string, apiKey: string): Promise<SpecProductLookupResult> {
  const params = new URLSearchParams({ engine: 'google', q: query, api_key: apiKey })
  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`)
  if (!response.ok) {
    return { status: 'failed', provider: 'serpapi', query, error: `SerpAPI lookup failed with ${response.status}.` }
  }
  const json = await response.json() as {
    organic_results?: Array<{ title?: string; link?: string; snippet?: string }>
  }
  const results = (json.organic_results ?? []).slice(0, 5).map((item) => ({
    title: compact(item.title) || 'Product result',
    url: compact(item.link) || undefined,
    snippet: compact(item.snippet).slice(0, 500) || undefined,
  }))
  return {
    status: results.length > 0 ? 'found' : 'not_found',
    provider: 'serpapi',
    query,
    results,
  }
}

export async function enrichVendorProductProfile(profile: VendorProductProfile): Promise<VendorProductProfile> {
  const key = lookupKey(profile)
  if (!key || !profile.vendor_sku) {
    return {
      ...profile,
      lookup: { status: 'skipped', error: 'No vendor SKU was supplied for product lookup.' },
    }
  }

  const cached = await readCachedLookup(key)
  if (cached) return { ...profile, lookup: cached }

  const query = lookupQuery(profile)
  const tavilyKey = process.env.TAVILY_API_KEY || process.env.SPEC_RAG_SEARCH_API_KEY
  const serpApiKey = process.env.SERPAPI_API_KEY
  let result: SpecProductLookupResult

  if (process.env.SPEC_RAG_WEB_LOOKUP_DISABLED === '1') {
    result = { status: 'skipped', query, error: 'Web product lookup disabled by environment.' }
  } else if (tavilyKey) {
    result = await tavilyLookup(query, tavilyKey)
  } else if (serpApiKey) {
    result = await serpApiLookup(query, serpApiKey)
  } else {
    result = { status: 'skipped', query, error: 'No web product lookup provider is configured.' }
  }

  await writeCachedLookup(key, profile, result)
  return { ...profile, lookup: result }
}
