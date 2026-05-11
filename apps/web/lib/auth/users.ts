/**
 * User CRUD against Neon Postgres via Drizzle.
 * SERVER-SIDE ONLY - never import from client components.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users as usersTable } from '@/lib/db/schema'
import type { User } from './types'

function rowToUser(row: typeof usersTable.$inferSelect): User {
  return {
    ...row,
    role: row.role as User['role'],
    company_info: row.company_info ? JSON.parse(row.company_info) : undefined,
  }
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
  const row = rows[0]
  return row ? rowToUser(row) : null
}

export async function findUserById(id: string): Promise<User | null> {
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, id))
  const row = rows[0]
  return row ? rowToUser(row) : null
}

export async function createUser(data: Omit<User, 'id' | 'created_at'>): Promise<User> {
  const id = crypto.randomUUID()
  const created_at = new Date().toISOString()
  await db.insert(usersTable).values({
    id,
    email: data.email.toLowerCase(),
    password_hash: data.password_hash,
    name: data.name,
    role: data.role,
    company_info: data.company_info ? JSON.stringify(data.company_info) : null,
    onboarding_completed: data.onboarding_completed,
    created_at,
  })
  return { ...data, id, created_at }
}

export async function updateUser(id: string, updates: Partial<Omit<User, 'id' | 'created_at'>>): Promise<User | null> {
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, id))
  const row = rows[0]
  if (!row) return null
  const patch: Partial<typeof usersTable.$inferInsert> = {}
  if (updates.email !== undefined) patch.email = updates.email.toLowerCase()
  if (updates.password_hash !== undefined) patch.password_hash = updates.password_hash
  if (updates.name !== undefined) patch.name = updates.name
  if (updates.role !== undefined) patch.role = updates.role
  if (updates.onboarding_completed !== undefined) patch.onboarding_completed = updates.onboarding_completed
  if (updates.company_info !== undefined) patch.company_info = JSON.stringify(updates.company_info)
  await db.update(usersTable).set(patch).where(eq(usersTable.id, id))
  return rowToUser({ ...row, ...patch, company_info: patch.company_info ?? row.company_info })
}
