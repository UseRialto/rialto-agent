import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { beginGoogleOAuth, humanizeMailError } from '@/lib/mail/service'

const OAUTH_STATE_COOKIE = 'insiteai_google_oauth_state'
const OAUTH_RETURN_COOKIE = 'insiteai_google_oauth_return'
const OAUTH_REDIRECT_URI_COOKIE = 'insiteai_google_oauth_redirect_uri'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const redirectUri = new URL('/api/auth/google/callback', request.url).toString()
    const { stateToken, location } = beginGoogleOAuth(redirectUri)
    const response = NextResponse.redirect(location)
    response.cookies.set(OAUTH_STATE_COOKIE, stateToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10,
    })
    response.cookies.set(OAUTH_REDIRECT_URI_COOKIE, redirectUri, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10,
    })
    response.cookies.set(OAUTH_RETURN_COOKIE, '/contractor/settings', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10,
    })
    return response
  } catch (error) {
    return NextResponse.redirect(
      new URL(`/contractor/settings?google_error=${encodeURIComponent(humanizeMailError(error))}`, request.url),
    )
  }
}
