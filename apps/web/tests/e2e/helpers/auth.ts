import type { Browser, BrowserContext, Page } from '@playwright/test'
import { encrypt } from '../../../lib/auth/session'

export const PLAYWRIGHT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'

type SessionKey = 'contractor' | 'vendorPacific' | 'vendorConsolidated'

const SESSION_FIXTURES = {
  contractor: {
    userId: 'contractor-001',
    role: 'contractor' as const,
    name: 'Sarah Chen',
    email: 'sarah@mccarthy.com',
    onboarding_completed: true,
  },
  vendorPacific: {
    userId: 'vendor-001',
    role: 'vendor' as const,
    name: 'David Park',
    email: 'david@pacificsteel.com',
    onboarding_completed: true,
  },
  vendorConsolidated: {
    userId: 'vendor-002',
    role: 'vendor' as const,
    name: 'Anna Williams',
    email: 'anna@consolidated.com',
    onboarding_completed: true,
  },
} satisfies Record<SessionKey, {
  userId: string
  role: 'contractor' | 'vendor'
  name: string
  email: string
  onboarding_completed: boolean
}>

async function addSessionCookie(context: BrowserContext, sessionKey: SessionKey) {
  const token = await encrypt(SESSION_FIXTURES[sessionKey])
  const url = new URL(PLAYWRIGHT_BASE_URL)
  await context.addCookies([
    {
      name: 'insiteai_session',
      value: token,
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
      domain: url.hostname,
      path: '/',
    },
  ])
}

export async function authenticatePage(page: Page, sessionKey: SessionKey = 'contractor') {
  await addSessionCookie(page.context(), sessionKey)
}

export async function createAuthenticatedContext(browser: Browser, sessionKey: SessionKey = 'contractor') {
  const context = await browser.newContext({ baseURL: PLAYWRIGHT_BASE_URL })
  await addSessionCookie(context, sessionKey)
  return context
}

export async function createAuthenticatedPage(browser: Browser, sessionKey: SessionKey = 'contractor') {
  const context = await createAuthenticatedContext(browser, sessionKey)
  const page = await context.newPage()
  return { context, page }
}
