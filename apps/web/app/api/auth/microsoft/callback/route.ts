import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { attachMicrosoftMailbox, humanizeMailError } from '@/lib/mail/service'

const OAUTH_STATE_COOKIE = 'insiteai_mail_oauth_state'
const OAUTH_RETURN_COOKIE = 'insiteai_mail_oauth_return'
const OAUTH_REDIRECT_URI_COOKIE = 'insiteai_microsoft_oauth_redirect_uri'

function renderRedirectPage(message: string, success: boolean, destination: string) {
  const safe = message
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="1; url=${destination}" />
    <title>${success ? 'Microsoft connected' : 'Microsoft connect failed'}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f5f5f5; color: #111827; }
      .card { max-width: 440px; margin: 80px auto; background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; box-shadow: 0 4px 18px rgba(0,0,0,0.06); }
      strong { display: block; margin-bottom: 8px; }
      p { margin: 0; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <strong>${success ? 'Microsoft connected' : 'Microsoft connect failed'}</strong>
      <p>${safe}</p>
    </div>
  </body>
</html>`
}

function withStatusParam(destination: string, key: string, value: string) {
  const separator = destination.includes('?') ? '&' : '?'
  return `${destination}${separator}${key}=${encodeURIComponent(value)}`
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const error = url.searchParams.get('error')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const requestCookies = new Headers(request.headers).get('cookie') ?? ''
  const cookies = Object.fromEntries(
    requestCookies
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=')
        return index === -1
          ? [part, '']
          : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))]
      }),
  )
  const expectedState = cookies[OAUTH_STATE_COOKIE]
  const returnTo = cookies[OAUTH_RETURN_COOKIE]?.startsWith('/contractor/')
    ? cookies[OAUTH_RETURN_COOKIE]
    : '/contractor/settings'

  const clearCookies = (response: NextResponse) => {
    response.cookies.delete(OAUTH_STATE_COOKIE)
    response.cookies.delete(OAUTH_RETURN_COOKIE)
    response.cookies.delete(OAUTH_REDIRECT_URI_COOKIE)
    return response
  }

  try {
    const session = await getSession()
    if (!session) {
      return clearCookies(NextResponse.redirect(new URL('/login', request.url)))
    }

    if (error) throw new Error(error)
    if (!code) throw new Error('Microsoft did not return an authorization code.')
    if (!state || !expectedState || state !== expectedState) throw new Error('Microsoft sign-in state mismatch. Try again.')

    const redirectUri = cookies[OAUTH_REDIRECT_URI_COOKIE] ?? new URL('/api/auth/microsoft/callback', request.url).toString()
    const { emailAddress } = await attachMicrosoftMailbox(code, session.userId, redirectUri)
    const destination = withStatusParam(returnTo, 'microsoft_connected', '1')

    const response = new NextResponse(
      renderRedirectPage(`Connected as ${emailAddress}. Returning to Rialto now.`, true, destination),
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
    return clearCookies(response)
  } catch (caught) {
    const destination = withStatusParam(returnTo, 'microsoft_error', humanizeMailError(caught))
    const response = new NextResponse(
      renderRedirectPage(humanizeMailError(caught), false, destination),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
    return clearCookies(response)
  }
}
