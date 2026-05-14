import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildTradeScopedSpecPackage, normalizeContractorTrade, selectTradeScopedSpecChunks } from './package'
import type { RetrievedSpecChunk } from './types'

const corpusDir = '/Users/tomasz/Desktop/rialto/project_specs'
const hasCorpus = fs.existsSync(corpusDir)

function parseCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells
}

function readCsv(filePath: string): Array<Record<string, string>> {
  const [headerLine = '', ...lines] = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/)
  const headers = parseCsvLine(headerLine)
  return lines.filter(Boolean).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}

function chunkFromSection(row: Record<string, string>, id: number): RetrievedSpecChunk {
  return {
    id,
    document_id: 1,
    document_name: row.file || row.source_pdf || 'project-manual.pdf',
    page_start: Number(row.page || row.source_page_hint || 1),
    page_end: Number(row.page || row.source_page_hint || 1),
    section_number: row.code || row.section?.slice(0, 8).trim(),
    canonical_section_number: (row.code || row.section || '').replace(/[^0-9]/g, ''),
    section_title: row.title || row.section?.replace(/^[0-9 ]+/, '').trim(),
    content: [
      row.section || `${row.code} ${row.title}`,
      row.compliance_check,
      'Products, substitutions, approved equals, shop drawings, product data, and material requirements apply.',
    ].filter(Boolean).join(' '),
  }
}

describe.skipIf(!hasCorpus)('trade-scoped project spec package corpus examples', () => {
  it('normalizes common contractor trade names to stable package keys', () => {
    expect(normalizeContractorTrade('Electrical')).toBe('electrical_power')
    expect(normalizeContractorTrade('Fire Alarm')).toBe('fire_alarm_security')
    expect(normalizeContractorTrade('casework countertops')).toBe('casework_countertops')
  })

  it('selects the expected trade sections for every generated material-spec trade', () => {
    const materialRows = readCsv(path.join(corpusDir, 'MATERIAL_SPEC_INDEX.csv'))
    const trades = [...new Set(materialRows.map((row) => row.trade))].sort()

    for (const trade of trades) {
      const rows = materialRows.filter((row) => row.trade === trade)
      const chunks = rows.map((row, index) => chunkFromSection(row, index + 1))
      const selected = selectTradeScopedSpecChunks(chunks, trade)
      const selectedSections = selected.map((entry) => entry.chunk.section_number)
      const materialSections = rows.map((row) => row.section.slice(0, 8).trim())

      expect(selected.length, `${trade} should keep a reviewable subset`).toBeGreaterThan(0)
      expect(selectedSections.some((section) => materialSections.includes(section ?? '')), `${trade} should keep at least one of its material-spec sections`).toBe(true)
      expect(selected.length, `${trade} should be a subset, not the whole project manual`).toBeLessThanOrEqual(chunks.length)
    }
  })

  it('builds a reviewable concrete package from an actual extracted project manual index', () => {
    const sectionRows = readCsv(path.join(corpusDir, '01_unlv_vivarium', 'extracted_sections.csv'))
    const chunks = sectionRows.map((row, index) => chunkFromSection(row, index + 1))
    const specPackage = buildTradeScopedSpecPackage(chunks, 'concrete')
    const reviewSections = specPackage.selected.slice(0, 8).map((entry) => `${entry.chunk.section_number} ${entry.chunk.section_title}`)

    expect(specPackage.normalizedTrade).toBe('concrete')
    expect(specPackage.diagnostics.source_chunk_count).toBeGreaterThan(100)
    expect(specPackage.diagnostics.selected_chunk_count).toBeGreaterThan(0)
    expect(specPackage.diagnostics.selected_chunk_count).toBeLessThan(specPackage.diagnostics.source_chunk_count)
    expect(reviewSections).toEqual(expect.arrayContaining([
      expect.stringMatching(/03 30 00 Cast-In-Place Concrete/i),
    ]))
    expect(specPackage.content).toContain('concrete project spec package')
  })
})
