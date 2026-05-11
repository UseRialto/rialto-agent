import { NextRequest, NextResponse } from 'next/server'
import { like, eq, or, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users as usersTable } from '@/lib/db/schema'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.toLowerCase().trim() ?? ''

  if (q.length < 2) {
    return NextResponse.json([])
  }

  const pattern = `%${q}%`
  const vendors = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, 'vendor'),
        or(like(usersTable.name, pattern), like(usersTable.email, pattern)),
      ),
    )
    .limit(6)

  return NextResponse.json(vendors.map((u) => ({ ...u, onPlatform: true })))
}
