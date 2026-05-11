import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/auth/session'

const PUBLIC_ROUTES = ['/login', '/register']
const PUBLIC_PREFIXES = ['/vendor/magic-rfq/', '/vendor/order-update/']
const VENDOR_PREFIX = '/vendor'
const CONTRACTOR_PREFIX = '/contractor'
const CONTRACTOR_ONBOARDING = '/contractor/onboarding'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname)
  const isPublicPrefixRoute = PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  const isVendorRoute = pathname.startsWith(VENDOR_PREFIX)
  const isContractorRoute = pathname.startsWith(CONTRACTOR_PREFIX)

  const token = request.cookies.get('insiteai_session')?.value
  const session = token ? await decrypt(token) : null

  // Unauthenticated on protected routes → login
  if (!isPublicRoute && !isPublicPrefixRoute && !session) {
    const loginUrl = new URL('/login', request.nextUrl)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Vendor route but not a vendor → contractor home
  if (!isPublicPrefixRoute && isVendorRoute && session && session.role !== 'vendor') {
    return NextResponse.redirect(new URL('/contractor/projects', request.nextUrl))
  }

  // Contractor route but not a contractor → vendor home
  if (!isPublicPrefixRoute && isContractorRoute && session && session.role !== 'contractor') {
    return NextResponse.redirect(new URL('/vendor/projects', request.nextUrl))
  }

  if (
    isContractorRoute &&
    session?.role === 'contractor' &&
    !session.onboarding_completed &&
    pathname !== CONTRACTOR_ONBOARDING
  ) {
    return NextResponse.redirect(new URL(CONTRACTOR_ONBOARDING, request.nextUrl))
  }

  if (pathname === CONTRACTOR_ONBOARDING && session?.role === 'contractor' && session.onboarding_completed) {
    return NextResponse.redirect(new URL('/contractor/projects', request.nextUrl))
  }

  // Already logged in, trying login/register → redirect home
  if (isPublicRoute && session) {
    const dest = session.role === 'vendor'
      ? '/vendor/projects'
      : session.onboarding_completed ? '/contractor/projects' : CONTRACTOR_ONBOARDING
    return NextResponse.redirect(new URL(dest, request.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/vendor/:path*', '/contractor/:path*', '/login', '/register'],
}
