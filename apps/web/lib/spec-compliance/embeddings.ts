import { readFileSync } from 'fs'
import { join } from 'path'

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536
const MAX_EMBEDDING_INPUT_CHARS = 8_000
const EMBEDDING_BATCH_SIZE = 48

let envLoaded = false

function ensureLocalEnvLoaded() {
  if (envLoaded) return
  envLoaded = true
  try {
    const lines = readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')
    for (const line of lines) {
      const eq = line.indexOf('=')
      if (eq <= 0) continue
      const key = line.slice(0, eq).trim()
      const raw = line.slice(eq + 1).trim()
      const value = raw.replace(/^"|"$/g, '')
      if (key && !process.env[key]) process.env[key] = value
    }
  } catch {}
}

export function embeddingModelName() {
  ensureLocalEnvLoaded()
  return process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL
}

function embeddingApiKey() {
  ensureLocalEnvLoaded()
  return process.env.OPENAI_API_KEY
}

function normalizeEmbedding(vector: unknown): number[] | undefined {
  if (!Array.isArray(vector)) return undefined
  if (vector.length !== EMBEDDING_DIMENSIONS) return undefined
  const numbers = vector.map((value) => Number(value))
  return numbers.every((value) => Number.isFinite(value)) ? numbers : undefined
}

function trimInput(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_EMBEDDING_INPUT_CHARS)
}

export function canGenerateEmbeddings() {
  return Boolean(embeddingApiKey())
}

export async function generateEmbedding(text: string): Promise<number[] | undefined> {
  const [embedding] = await generateEmbeddings([text])
  return embedding
}

export async function generateEmbeddings(texts: string[]): Promise<Array<number[] | undefined>> {
  const apiKey = embeddingApiKey()
  const inputs = texts.map(trimInput)
  if (!apiKey || inputs.length === 0) return inputs.map(() => undefined)

  const output: Array<number[] | undefined> = []
  for (let index = 0; index < inputs.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = inputs.slice(index, index + EMBEDDING_BATCH_SIZE)
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: embeddingModelName(),
          input: batch,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      })
      if (!response.ok) {
        output.push(...batch.map(() => undefined))
        continue
      }
      const json = await response.json() as { data?: Array<{ index?: number; embedding?: unknown }> }
      const byIndex = new Map<number, number[] | undefined>()
      for (const row of json.data ?? []) {
        byIndex.set(Number(row.index ?? 0), normalizeEmbedding(row.embedding))
      }
      for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
        output.push(byIndex.get(batchIndex))
      }
    } catch {
      output.push(...batch.map(() => undefined))
    }
  }
  return output
}
