import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { beginMicrosoftOAuth, humanizeMailError } from '@/lib/mail/service'

const OAUTH_STATE_COOKIE = 'insiteai_mail_oauth_state'
const OAUTH_RETURN_COOKIE = 'insiteai_mail_oauth_return'
const OAUTH_REDIRECT_URI_COOKIE = 'insiteai_microsoft_oauth_redirect_uri'

export async function GET(request: Request) {
  const session = await getSession()
  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const isReconnect = Boolean(session?.role === 'contractor')
  const returnTo = isReconnect ? '/contractor/settings' : (from || '/contractor/projects')

  try {
    const redirectUri = new URL('/api/auth/microsoft/callback', request.url).toString()
    const { stateToken, location } = beginMicrosoftOAuth(redirectUri)
    const response = NextResponse.redirect(location)
    response.cookies.set(OAUTH_REDIRECT_URI_COOKIE, redirectUri, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10,
    })
    response.cookies.set(OAUTH_STATE_COOKIE, stateToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10,
    })
    response.cookies.set(OAUTH_RETURN_COOKIE, returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10,
    })
    return response
  } catch (error) {
    const fallback = isReconnect ? '/contractor/settings' : '/login'
    return NextResponse.redirect(
      new URL(`${fallback}?microsoft_error=${encodeURIComponent(humanizeMailError(error))}`, request.url),
    )
  }
}
