import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const appDir = existsSync(resolve(process.cwd(), 'package.json')) && existsSync(resolve(process.cwd(), 'playwright.config.ts'))
  ? process.cwd()
  : resolve(process.cwd(), 'apps/web')
config({ path: resolve(appDir, '.env.local') })
config({ path: resolve(appDir, '.env') })

const REQUIRED_PROJECT_ID = 'proj-s001'

export default async function globalSetup() {
  if (process.env.E2E_SKIP_DB_PREFLIGHT === '1') return

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('[e2e preflight] DATABASE_URL is not configured. E2E tests require the seeded Neon database.')
  }

  const sql = neon(databaseUrl)
  let lastError: unknown

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const rows = await withTimeout(
        sql`select id from projects where id = ${REQUIRED_PROJECT_ID} limit 1`,
        15_000,
      )
      if (Array.isArray(rows) && rows.length > 0) return
      throw new Error(`Seed project ${REQUIRED_PROJECT_ID} was not found. Run npm run seed --prefix apps/web before e2e tests.`)
    } catch (error) {
      lastError = error
      if (attempt < 3) await sleep(500 * attempt)
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`[e2e preflight] Cannot reach the seeded Neon database: ${message}`)
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`Database preflight timed out after ${timeoutMs}ms.`)), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
