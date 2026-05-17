import { NextRequest, NextResponse } from 'next/server'
import { like, eq, or, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users as usersTable } from '@/lib/db/schema'
import { getSession } from '@/lib/auth/session'
import { searchVendorRelationships } from '@/lib/store/contractor-store'

function splitVendorName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  }
}

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

  const onPlatformResults = vendors.map((u) => ({ ...u, onPlatform: true }))
  const seenEmails = new Set(onPlatformResults.map((vendor) => vendor.email.toLowerCase()))

  const session = await getSession()
  const savedContacts = session?.role === 'contractor'
    ? await searchVendorRelationships(session.userId, q, 6)
    : []

  const contactResults = savedContacts
    .filter((contact) => !seenEmails.has(contact.vendor_email.toLowerCase()))
    .map((contact) => {
      const name = contact.vendor_name || contact.vendor_email
      return {
        id: contact.vendor_id ?? undefined,
        name,
        email: contact.vendor_email,
        ...splitVendorName(name),
        onPlatform: false,
      }
    })

  return NextResponse.json([...onPlatformResults, ...contactResults].slice(0, 6))
}
