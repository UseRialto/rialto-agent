import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const sql = process.env.DATABASE_URL
  ? neon(process.env.DATABASE_URL)
  : (async () => {
      throw new Error('DATABASE_URL is not configured. Add it to apps/insiteai-web/.env.local to use database-backed pages.')
    }) as unknown as ReturnType<typeof neon>
export const db = drizzle(sql, { schema })
export type DB = typeof db
