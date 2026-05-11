import type { ExtractedPdfPage, SpecChunkInput } from './types'

const MAX_CHUNK_TOKENS = 1_200
const TARGET_CHUNK_TOKENS = 950
const OVERLAP_TOKENS = 140
const MIN_CHUNK_TOKENS = 40
const SECTION_RE = /\b(?:SECTION|DOCUMENT)\s+([0-9]{2}\s?[0-9]{2}\s?[0-9]{2}(?:\.[0-9]+)?|[0-9]{6})\b\s*[-–:]?\s*([A-Z][A-Z0-9 &,/().'-]{3,})?/i

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function canonicalSectionNumber(value?: string) {
  const normalized = String(value ?? '').replace(/[^0-9]/g, '')
  return normalized || undefined
}

function displaySectionNumber(value: string) {
  const canonical = canonicalSectionNumber(value)
  if (!canonical) return undefined
  if (canonical.length === 6) return `${canonical.slice(0, 2)} ${canonical.slice(2, 4)} ${canonical.slice(4, 6)}`
  return canonical
}

function approxTokens(text: string) {
  return Math.max(1, Math.ceil(compact(text).length / 4))
}

function detectSection(text: string, previous?: { section_number?: string; section_title?: string }) {
  const match = text.match(SECTION_RE)
  if (!match) return previous ?? {}
  const sectionNumber = displaySectionNumber(match[1])
  const title = compact(match[2] ?? '')
    .replace(/\bEND OF (DOCUMENT|SECTION)\b.*$/i, '')
    .trim()
  return {
    section_number: sectionNumber,
    section_title: title || previous?.section_title,
  }
}

type SectionState = { section_number?: string; section_title?: string }
type WorkingChunk = {
  page_start: number
  page_end: number
  section: SectionState
  words: string[]
}

function wordTokens(words: string[]) {
  return Math.max(1, Math.ceil(words.join(' ').length / 4))
}

function pushChunk(chunks: SpecChunkInput[], current: WorkingChunk | null, keepOverlap: boolean): WorkingChunk | null {
  if (!current || current.words.length === 0) return null
  const content = compact(current.words.join(' '))
  const tokenCount = approxTokens(content)
  if (tokenCount >= MIN_CHUNK_TOKENS) {
    chunks.push({
      chunk_index: chunks.length,
      chunk_type: 'child',
      page_start: current.page_start,
      page_end: current.page_end,
      section_number: current.section.section_number,
      canonical_section_number: canonicalSectionNumber(current.section.section_number),
      section_title: current.section.section_title,
      token_count: tokenCount,
      content,
    })
  }

  if (!keepOverlap) return null
  const overlapWords = current.words.slice(-OVERLAP_TOKENS * 2)
  while (wordTokens(overlapWords) > OVERLAP_TOKENS && overlapWords.length > 0) {
    overlapWords.shift()
  }
  return overlapWords.length > 0
    ? {
        page_start: current.page_end,
        page_end: current.page_end,
        section: current.section,
        words: overlapWords,
      }
    : null
}

function sameSection(a: SectionState, b: SectionState) {
  return canonicalSectionNumber(a.section_number) === canonicalSectionNumber(b.section_number)
    && compact(a.section_title ?? '') === compact(b.section_title ?? '')
}

export function chunkExtractedPages(pages: ExtractedPdfPage[]): SpecChunkInput[] {
  const chunks: SpecChunkInput[] = []
  let section: SectionState = {}
  let current: WorkingChunk | null = null

  for (const page of pages) {
    const pageText = compact(page.text)
    if (!pageText) continue
    const nextSection = detectSection(pageText, section)
    const sectionChanged = Boolean(current && nextSection.section_number && !sameSection(nextSection, section))
    if (sectionChanged) {
      current = pushChunk(chunks, current, false)
    }

    section = nextSection
    const words = pageText.split(/\s+/).filter(Boolean)
    if (!current) {
      current = {
        page_start: page.pageNumber,
        page_end: page.pageNumber,
        section,
        words: [],
      }
    }

    current.section = current.section.section_number ? current.section : section
    for (const word of words) {
      current!.words.push(word)
      current!.page_end = page.pageNumber
      if (wordTokens(current!.words) >= MAX_CHUNK_TOKENS) {
        current = pushChunk(chunks, current, true)
        if (!current) {
          current = {
            page_start: page.pageNumber,
            page_end: page.pageNumber,
            section,
            words: [],
          }
        }
      } else if (wordTokens(current!.words) >= TARGET_CHUNK_TOKENS && pageText.length > 2_000) {
        current = pushChunk(chunks, current, true)
        if (!current) {
          current = {
            page_start: page.pageNumber,
            page_end: page.pageNumber,
            section,
            words: [],
          }
        }
      }
    }
  }

  pushChunk(chunks, current, false)
  return chunks.map((chunk, index) => ({ ...chunk, chunk_index: index }))
}
