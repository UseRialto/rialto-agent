import fs from 'fs'
import path from 'path'
import { randomBytes, randomUUID } from 'crypto'
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bids,
  bidLineItems,
  contractorMailboxes,
  projects,
  rfqEmailAttachments,
  rfqEmailMessages,
  rfqInvites,
  rfqLineItems,
  rfqQuoteLineItems,
  rfqQuoteResponses,
  rfqReviewTasks,
  rfqMagicLinks,
  rfqs,
  rfqVendorRequests,
} from '@/lib/db/schema'
import { createUser, findUserByEmail, findUserById } from '@/lib/auth/users'
import { appendMagicFormLink, buildRFQEmailDraft, buildRFQEmailBody, buildRFQEmailSubject, renderVendorEmailTemplate } from '@/lib/mail/rfq-email-draft'
import { createMagicFormLink } from '@/lib/magic-rfq/service'
import { buildRFQPdfBytes } from '@/lib/rfq-pdf'
import { runBidSpecCompliance } from '@/lib/spec-compliance'
import type {
  ContractorBid,
  ContractorMailboxSummary,
  OffPlatformSendResult,
  OffPlatformSendSummary,
  RFQEmailAttachmentSummary,
  RFQEmailMessageSummary,
  RFQEmailWorkflowSummary,
  RFQReviewTaskSummary,
  RFQVendorRequestSummary,
} from '@/lib/types/contractor'

type MailProvider = 'google' | 'microsoft_365'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API_ROOT = 'https://gmail.googleapis.com/gmail/v1/users/me'
const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
]
const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com'
const MICROSOFT_GRAPH_ROOT = 'https://graph.microsoft.com/v1.0/me'
const MICROSOFT_SCOPES = [
  'offline_access',
  'openid',
  'email',
  'profile',
  'User.Read',
  'Mail.Read',
  'Mail.Send',
]
const RECENT_THREAD_LIMIT = 120
const MATCH_WINDOW_DAYS = 30
const MAIL_ROOT = path.join(process.cwd(), '.local', 'uploads', 'mail')

type MailboxRow = typeof contractorMailboxes.$inferSelect
type VendorRequestRow = typeof rfqVendorRequests.$inferSelect

type ProviderApiParams = {
  query?: Record<string, string | number | boolean | string[]>
  body?: unknown
  retryOn401?: boolean
  headers?: Record<string, string>
}

type OAuthSettings = {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  tokenUrl: string
  authUrl: string
}

type ParsedQuoteLine = {
  sourceName: string
  quantity: string
  unit: string
  unitPrice: string
  totalPrice: string
  leadTimeText: string
  notes: string
}

type Participant = {
  name: string
  email: string
}

type AttachmentDescriptor = {
  filename: string
  mimeType: string
  attachmentId: string
  inlineData: string
}

function nowIso() {
  return new Date().toISOString()
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderEmailHtmlBody(value: string) {
  const paragraphs = value
    .trim()
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) {
    return '<div style="font-family:Arial,sans-serif"></div>'
  }

  return `<div style="font-family:Arial,sans-serif;line-height:1.5">${paragraphs
    .map((paragraph, index) => {
      const margin = index === paragraphs.length - 1 ? '0' : '0 0 14px 0'
      return `<p style="margin:${margin}">${escapeHtml(paragraph)}</p>`
    })
    .join('')}</div>`
}

function cleanMessageId(value?: string | null) {
  return (value ?? '').trim().replace(/^<|>$/g, '')
}

function normalizeSubject(subject: string) {
  return subject
    .replace(/\b(?:re|fw|fwd)\s*:/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function tokenize(value: string) {
  return new Set((value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => token.length > 1))
}

function emailDomain(email: string) {
  return email.toLowerCase().split('@')[1] ?? ''
}

function parseNumber(value: string) {
  const cleaned = value.replaceAll(',', '').replaceAll('$', '').trim()
  if (!cleaned) return undefined
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}

function textConfidence(lines: string[]) {
  if (lines.length === 0) return 0
  const avg = lines.reduce((sum, line) => sum + line.length, 0) / lines.length
  return Math.min(0.95, 0.35 + avg / 120)
}

function decodeBase64Url(value?: string) {
  return Buffer.from((value ?? '').replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8')
}

function decodeBase64UrlBytes(value?: string) {
  return Buffer.from((value ?? '').replaceAll('-', '+').replaceAll('_', '/'), 'base64')
}

function buildHeaderMap(payload: Record<string, unknown>) {
  const headers = (payload.headers as Array<{ name?: string; value?: string }> | undefined) ?? []
  return headers.reduce<Record<string, string>>((acc, header) => {
    if (header.name) {
      acc[header.name.toLowerCase()] = header.value ?? ''
    }
    return acc
  }, {})
}

function primaryEmail(value: string) {
  const match = value.match(/<([^>]+)>/)
  return (match?.[1] ?? value).trim().toLowerCase()
}

function displayName(value: string) {
  const match = value.match(/^(.*?)(?:<[^>]+>)?$/)
  return (match?.[1] ?? '').replaceAll('"', '').trim()
}

function parseParticipants(value: string) {
  if (!value.trim()) return [] as Participant[]
  return value
    .split(',')
    .map((entry) => ({
      name: displayName(entry),
      email: primaryEmail(entry),
    }))
    .filter((participant) => participant.email)
}

function walkPayloadParts(payload?: Record<string, unknown>) {
  if (!payload) return [] as Record<string, unknown>[]
  const stack: Record<string, unknown>[] = [payload]
  const parts: Record<string, unknown>[] = []
  while (stack.length > 0) {
    const current = stack.pop()!
    parts.push(current)
    const children = (current.parts as Record<string, unknown>[] | undefined) ?? []
    for (const child of children) {
      stack.push(child)
    }
  }
  return parts
}

function extractGmailBodies(payload?: Record<string, unknown>) {
  let textBody = ''
  let htmlBody = ''
  for (const part of walkPayloadParts(payload)) {
    const mimeType = String(part.mimeType ?? '')
    const body = (part.body as Record<string, unknown> | undefined) ?? {}
    const data = typeof body.data === 'string' ? decodeBase64Url(body.data) : ''
    if (!data) continue
    if (!textBody && mimeType === 'text/plain') {
      textBody = data
    } else if (!htmlBody && mimeType === 'text/html') {
      htmlBody = data
    }
  }
  if (!textBody) {
    const body = (payload?.body as Record<string, unknown> | undefined) ?? {}
    if (typeof body.data === 'string') {
      textBody = decodeBase64Url(body.data)
    }
  }
  return { textBody, htmlBody }
}

function isoFromGmailMessage(headers: Record<string, string>, internalDate?: string) {
  const headerDate = headers.date
  if (headerDate) {
    const parsed = new Date(headerDate)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  if (internalDate) {
    const parsed = new Date(Number(internalDate))
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return nowIso()
}

function attachmentDescriptors(payload?: Record<string, unknown>) {
  const descriptors: AttachmentDescriptor[] = []
  for (const part of walkPayloadParts(payload)) {
    const filename = String(part.filename ?? '')
    const body = (part.body as Record<string, unknown> | undefined) ?? {}
    const attachmentId = typeof body.attachmentId === 'string' ? body.attachmentId : ''
    const inlineData = typeof body.data === 'string' ? body.data : ''
    const mimeType = String(part.mimeType ?? 'application/octet-stream')
    if (!filename && !attachmentId) continue
    descriptors.push({ filename, mimeType, attachmentId, inlineData })
  }
  return descriptors
}

function extractPdfishText(raw: Buffer) {
  const decoded = raw.toString('latin1')
  const literalChunks = [...decoded.matchAll(/\(([^()]*)\)/g)].map((match) => match[1] ?? '')
  const printableChunks = [...decoded.matchAll(/[A-Za-z0-9][A-Za-z0-9,./#:$%()&+\-\s]{5,}/g)].map((match) => match[0] ?? '')
  const chunks = [...literalChunks, ...printableChunks]
  const lines: string[] = []
  const seen = new Set<string>()
  for (const chunk of chunks) {
    const line = chunk.replace(/\s+/g, ' ').trim()
    if (line.length < 4) continue
    const lowered = line.toLowerCase()
    if (seen.has(lowered)) continue
    seen.add(lowered)
    lines.push(line)
  }
  return {
    text: lines.slice(0, 400).join('\n'),
    confidence: lines.length > 0 ? textConfidence(lines) : 0,
    sourceKind: 'pdf',
  }
}

function extractTextFromCsv(raw: Buffer) {
  const text = raw.toString('utf8')
  const rows = text
    .split(/\r?\n/)
    .slice(0, 300)
    .map((line) => line.split(',').map((cell) => cell.trim()).filter(Boolean).join(' | '))
    .filter(Boolean)
  return {
    text: rows.join('\n'),
    confidence: textConfidence(rows),
    sourceKind: 'csv',
  }
}

function extractTextFromAttachment(filename: string, mimeType: string, raw: Buffer) {
  const lowerName = filename.toLowerCase()
  if (lowerName.endsWith('.csv') || mimeType === 'text/csv') {
    return extractTextFromCsv(raw)
  }
  if (lowerName.endsWith('.pdf') || mimeType === 'application/pdf') {
    return extractPdfishText(raw)
  }
  const text = raw.toString('utf8')
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  return {
    text: lines.slice(0, 400).join('\n'),
    confidence: textConfidence(lines),
    sourceKind: 'text',
  }
}

function parseLeadTimeDays(value: string) {
  const match = value.match(/(\d+)\s*(day|days|week|weeks|business days)/i)
  if (!match) return undefined
  const qty = Number(match[1])
  if (!Number.isFinite(qty)) return undefined
  const unit = match[2].toLowerCase()
  return unit.startsWith('week') ? qty * 7 : qty
}

function parseQuoteLines(text: string): ParsedQuoteLine[] {
  const results: ParsedQuoteLine[] = []
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim().replace(/^[-\s]+|[-\s]+$/g, ''))
  for (const line of lines) {
    if (line.length < 4) continue
    const lower = line.toLowerCase()
    if (['quote', 'rfq', 'thank you', 'best,', 'regards'].some((marker) => lower.includes(marker)) && !line.includes('$')) {
      continue
    }
    const prices = [...line.matchAll(/\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|\d+(?:\.\d{1,2})?)/g)].map((match) => match[1] ?? '')
    const qtyMatch = line.match(/\b(\d+(?:\.\d+)?)\b/)
    const unitMatch = line.match(/\b(ea|each|pcs|pc|ft|lf|sf|yd|bag|box|roll|sheet|lb|lbs|ton|tons|gal|gallon)\b/i)
    const leadMatch = line.match(/(\d+\s*(?:day|days|week|weeks|business days))/i)
    if (prices.length === 0 && !leadMatch && tokenize(line).size < 3) continue
    let sourceName = line
      .replace(/\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/g, '')
      .replace(/\b\d+(?:\.\d+)?\b/g, '')
      .replace(/\b(?:ea|each|pcs|pc|ft|lf|sf|yd|bag|box|roll|sheet|lb|lbs|ton|tons|gal|gallon)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[,:-]+|[,:-]+$/g, '')
    if (!sourceName) sourceName = line.slice(0, 120)
    results.push({
      sourceName,
      quantity: qtyMatch?.[1] ?? '',
      unit: unitMatch?.[1] ?? '',
      unitPrice: prices.at(-1)?.replaceAll('$', '').trim() ?? '',
      totalPrice: '',
      leadTimeText: leadMatch?.[1] ?? '',
      notes: line,
    })
  }
  return results.slice(0, 100)
}

function matchQuoteLineItem(
  rfqItems: Array<{ id: string; requestedText: string; normalizedName: string }>,
  sourceName: string,
) {
  const sourceTokens = tokenize(sourceName)
  let bestId: string | undefined
  let bestScore = 0
  for (const item of rfqItems) {
    const itemTokens = tokenize(item.normalizedName || item.requestedText)
    if (sourceTokens.size === 0 || itemTokens.size === 0) continue
    const overlap = [...sourceTokens].filter((token) => itemTokens.has(token)).length
    if (overlap === 0) continue
    const score = overlap / Math.max(itemTokens.size, 1)
    if (score > bestScore) {
      bestId = item.id
      bestScore = score
    }
  }
  return { rfqLineItemId: bestId, confidence: bestScore }
}

function getGoogleOAuthSettings(): OAuthSettings {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI?.trim() ?? 'http://localhost:3000/api/auth/google/callback',
    scopes: GOOGLE_SCOPES,
    tokenUrl: GOOGLE_TOKEN_URL,
    authUrl: GOOGLE_AUTH_URL,
  }
}

function getMicrosoftOAuthSettings(): OAuthSettings {
  const tenant = process.env.MICROSOFT_TENANT_ID?.trim() || 'common'
  return {
    clientId: process.env.MICROSOFT_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? '',
    redirectUri: process.env.MICROSOFT_REDIRECT_URI?.trim() ?? 'http://localhost:3000/api/auth/microsoft/callback',
    scopes: MICROSOFT_SCOPES,
    tokenUrl: `${MICROSOFT_AUTH_URL}/${tenant}/oauth2/v2.0/token`,
    authUrl: `${MICROSOFT_AUTH_URL}/${tenant}/oauth2/v2.0/authorize`,
  }
}

function getOAuthSettings(provider: MailProvider): OAuthSettings {
  return provider === 'microsoft_365' ? getMicrosoftOAuthSettings() : getGoogleOAuthSettings()
}

export function googleOAuthAvailable() {
  const settings = getGoogleOAuthSettings()
  return Boolean(settings.clientId && settings.clientSecret)
}

export function microsoftOAuthAvailable() {
  const settings = getMicrosoftOAuthSettings()
  return Boolean(settings.clientId && settings.clientSecret)
}

export function availableMailboxProviders(): MailProvider[] {
  const providers: MailProvider[] = []
  if (googleOAuthAvailable()) providers.push('google')
  if (microsoftOAuthAvailable()) providers.push('microsoft_365')
  return providers
}

function mailboxOAuthAvailable(provider?: MailProvider | null) {
  if (provider === 'microsoft_365') return microsoftOAuthAvailable()
  if (provider === 'google') return googleOAuthAvailable()
  return availableMailboxProviders().length > 0
}

function providerLabel(provider: MailProvider) {
  return provider === 'microsoft_365' ? 'Microsoft 365' : 'Google'
}

export function humanizeMailError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  if (lower.includes('google oauth is not configured')) {
    return 'Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then restart the app.'
  }
  if (lower.includes('microsoft oauth is not configured')) {
    return 'Microsoft 365 sign-in is not configured yet. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET, then restart the app.'
  }
  if (lower.includes('redirect_uri_mismatch')) {
    return 'Google blocked sign-in because the redirect URI does not match the OAuth app settings.'
  }
  if (lower.includes('aadsts50011')) {
    return 'Microsoft blocked sign-in because the redirect URI does not match the app registration.'
  }
  if (lower.includes('invalid_client')) {
    return 'The mailbox OAuth credentials are invalid. Double-check the client ID and client secret.'
  }
  if (lower.includes('access_denied')) {
    return 'Mailbox sign-in was canceled or denied.'
  }
  if (lower.includes('only available for contractor accounts')) {
    return 'This mailbox account is linked to a non-contractor user. Use a contractor account for this branch.'
  }
  if (lower.includes('missing google refresh token')) {
    return 'The Google mailbox connection is incomplete. Reconnect the Google account.'
  }
  if (lower.includes('missing microsoft refresh token')) {
    return 'The Microsoft 365 mailbox connection is incomplete. Reconnect the Microsoft account.'
  }
  return message
}

async function ensureMailboxRow(userId: string) {
  const existing = (await db.select().from(contractorMailboxes).where(eq(contractorMailboxes.user_id, userId)))[0]
  if (existing) return existing
  const stamp = nowIso()
  await db.insert(contractorMailboxes).values({
    user_id: userId,
    created_at: stamp,
    updated_at: stamp,
  })
  return (await db.select().from(contractorMailboxes).where(eq(contractorMailboxes.user_id, userId)))[0]!
}

async function getMailboxRow(userId: string) {
  return (await db.select().from(contractorMailboxes).where(eq(contractorMailboxes.user_id, userId)))[0] ?? ensureMailboxRow(userId)
}

async function updateMailbox(userId: string, updates: Partial<typeof contractorMailboxes.$inferInsert>) {
  await ensureMailboxRow(userId)
  await db.update(contractorMailboxes).set({ ...updates, updated_at: nowIso() }).where(eq(contractorMailboxes.user_id, userId))
  return getMailboxRow(userId)
}

async function clearMailbox(userId: string) {
  await updateMailbox(userId, {
    provider: 'google',
    provider_account_id: '',
    provider_sync_cursor: '',
    email_address: '',
    sender_name: '',
    access_token: '',
    refresh_token: '',
    token_expires_at: '',
    scope: '',
    connected_at: '',
    auth_state: '',
    gmail_history_id: '',
    last_sync_at: '',
  })
}

function buildMailboxSummary(mailbox?: MailboxRow | null): ContractorMailboxSummary {
  const row = mailbox ?? null
  const provider = row?.email_address ? ((row?.provider as MailProvider | null) ?? 'google') : undefined
  return {
    connected: Boolean(row?.email_address && row?.refresh_token),
    provider,
    emailAddress: row?.email_address ?? '',
    senderName: row?.sender_name ?? '',
    connectedAt: row?.connected_at || undefined,
    lastSyncAt: row?.last_sync_at || undefined,
    oauthAvailable: mailboxOAuthAvailable(provider),
    availableProviders: availableMailboxProviders(),
  }
}

async function postFormJson(url: string, payload: Record<string, string>) {
  const body = new URLSearchParams(payload)
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `${response.status} ${response.statusText}`)
  }
  return text ? JSON.parse(text) as Record<string, unknown> : {}
}

function tokenDeadline(expiresIn: number) {
  return new Date(Date.now() + Math.max(expiresIn - 60, 60) * 1000).toISOString()
}

async function exchangeOAuthCode(provider: MailProvider, code: string, redirectUri: string) {
  const settings = getOAuthSettings(provider)
  if (!mailboxOAuthAvailable(provider)) {
    throw new Error(`${providerLabel(provider)} OAuth is not configured on this server yet.`)
  }
  return postFormJson(settings.tokenUrl, {
    code,
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
}

async function refreshAccessToken(userId: string, provider: MailProvider) {
  const mailbox = await getMailboxRow(userId)
  const settings = getOAuthSettings(provider)
  if (!settings.clientId || !settings.clientSecret) {
    throw new Error(`${providerLabel(provider)} OAuth is not configured on this server yet.`)
  }
  if (!mailbox.refresh_token) {
    throw new Error(`Missing ${providerLabel(provider)} refresh token. Reconnect the mailbox account.`)
  }
  const token = await postFormJson(settings.tokenUrl, {
    refresh_token: mailbox.refresh_token,
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    grant_type: 'refresh_token',
  })
  await updateMailbox(userId, {
    access_token: String(token.access_token ?? ''),
    token_expires_at: tokenDeadline(Number(token.expires_in ?? 3600)),
    scope: String(token.scope ?? mailbox.scope),
  })
  return String(token.access_token ?? '')
}

function accessTokenFresh(mailbox: MailboxRow) {
  if (!mailbox.access_token || !mailbox.token_expires_at) return false
  const expiresAt = new Date(mailbox.token_expires_at)
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > Date.now()
}

function mailboxProvider(mailbox: MailboxRow): MailProvider {
  return (mailbox.provider as MailProvider) || 'google'
}

async function ensureProviderAccessToken(userId: string) {
  const mailbox = await getMailboxRow(userId)
  if (!mailbox.refresh_token && !mailbox.access_token) {
    throw new Error('Connect a mailbox account first.')
  }
  if (accessTokenFresh(mailbox)) return mailbox.access_token
  return refreshAccessToken(userId, mailboxProvider(mailbox))
}

async function googleApiRequest<T = Record<string, unknown>>(
  userId: string,
  method: string,
  pathName: string,
  params: ProviderApiParams = {},
): Promise<T> {
  const accessToken = await ensureProviderAccessToken(userId)
  const url = new URL(`${GMAIL_API_ROOT}${pathName}`)
  if (params.query) {
    for (const [key, rawValue] of Object.entries(params.query)) {
      if (Array.isArray(rawValue)) {
        for (const value of rawValue) url.searchParams.append(key, String(value))
      } else {
        url.searchParams.set(key, String(rawValue))
      }
    }
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(params.headers ?? {}),
    },
    body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
  })
  const text = await response.text()
  if (response.status === 401 && params.retryOn401 !== false) {
    await refreshAccessToken(userId, 'google')
    return googleApiRequest<T>(userId, method, pathName, { ...params, retryOn401: false })
  }
  if (!response.ok) {
    throw new Error(text || `${response.status} ${response.statusText}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

async function microsoftGraphRequest<T = Record<string, unknown>>(
  userId: string,
  method: string,
  pathName: string,
  params: ProviderApiParams = {},
): Promise<T> {
  const accessToken = await ensureProviderAccessToken(userId)
  const url = new URL(`${MICROSOFT_GRAPH_ROOT}${pathName}`)
  if (params.query) {
    for (const [key, rawValue] of Object.entries(params.query)) {
      if (Array.isArray(rawValue)) {
        for (const value of rawValue) url.searchParams.append(key, String(value))
      } else {
        url.searchParams.set(key, String(rawValue))
      }
    }
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(params.headers ?? {}),
    },
    body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
  })
  const text = await response.text()
  if (response.status === 401 && params.retryOn401 !== false) {
    await refreshAccessToken(userId, 'microsoft_365')
    return microsoftGraphRequest<T>(userId, method, pathName, { ...params, retryOn401: false })
  }
  if (!response.ok) {
    throw new Error(text || `${response.status} ${response.statusText}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

async function fetchGoogleProfile(userId: string) {
  return googleApiRequest<Record<string, unknown>>(userId, 'GET', '/profile')
}

async function fetchGoogleProfileWithAccessToken(accessToken: string) {
  const response = await fetch(`${GMAIL_API_ROOT}/profile`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `${response.status} ${response.statusText}`)
  }
  return (text ? JSON.parse(text) : {}) as Record<string, unknown>
}

async function fetchMicrosoftProfileWithAccessToken(accessToken: string) {
  const response = await fetch(`${MICROSOFT_GRAPH_ROOT}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `${response.status} ${response.statusText}`)
  }
  return (text ? JSON.parse(text) : {}) as Record<string, unknown>
}

async function listRecentGmailThreads(userId: string, limit = RECENT_THREAD_LIMIT) {
  const threadIds: string[] = []
  let pageToken = ''
  while (threadIds.length < limit) {
    const response = await googleApiRequest<{ threads?: Array<{ id?: string }>; nextPageToken?: string }>(
      userId,
      'GET',
      '/threads',
      {
        query: {
          maxResults: Math.min(100, limit - threadIds.length),
          q: 'in:anywhere',
          ...(pageToken ? { pageToken } : {}),
        },
      },
    )
    threadIds.push(...(response.threads ?? []).map((thread) => thread.id ?? '').filter(Boolean))
    pageToken = response.nextPageToken ?? ''
    if (!pageToken) break
  }
  return threadIds.slice(0, limit)
}

async function trackedThreadIdsForUser(userId: string) {
  const rows = await db
    .select({ gmailThreadId: rfqVendorRequests.gmail_thread_id })
    .from(rfqVendorRequests)
    .where(and(eq(rfqVendorRequests.contractor_user_id, userId), sql`${rfqVendorRequests.gmail_thread_id} != ''`))
    .orderBy(desc(rfqVendorRequests.last_message_at), desc(rfqVendorRequests.id))
    .limit(RECENT_THREAD_LIMIT)
  return rows.map((row) => row.gmailThreadId)
}

async function changedThreadIdsFromHistory(userId: string, startHistoryId: string) {
  let pageToken = ''
  const changed = new Set<string>()
  while (true) {
    const response = await googleApiRequest<{
      history?: Array<Record<string, unknown>>
      nextPageToken?: string
    }>(userId, 'GET', '/history', {
      query: {
        startHistoryId,
        historyTypes: ['messageAdded', 'labelsAdded', 'labelsRemoved'],
        ...(pageToken ? { pageToken } : {}),
      },
    })
    for (const record of response.history ?? []) {
      for (const key of ['messages', 'messagesAdded'] as const) {
        const values = Array.isArray(record[key]) ? record[key] as Array<Record<string, unknown>> : []
        for (const item of values) {
          const message = typeof item.message === 'object' && item.message ? item.message as Record<string, unknown> : item
          const threadId = typeof message.threadId === 'string' ? message.threadId : ''
          if (threadId) changed.add(threadId)
        }
      }
    }
    pageToken = response.nextPageToken ?? ''
    if (!pageToken) break
  }
  return [...changed]
}

async function fetchGmailThread(userId: string, gmailThreadId: string) {
  return googleApiRequest<Record<string, unknown>>(userId, 'GET', `/threads/${gmailThreadId}`, {
    query: { format: 'full' },
  })
}

async function fetchGmailAttachment(userId: string, gmailMessageId: string, attachmentId: string) {
  const response = await googleApiRequest<{ data?: string }>(
    userId,
    'GET',
    `/messages/${gmailMessageId}/attachments/${attachmentId}`,
  )
  return decodeBase64UrlBytes(response.data)
}

function buildGoogleAuthUrl(stateToken: string, redirectUri: string) {
  const settings = getGoogleOAuthSettings()
  if (!googleOAuthAvailable()) {
    throw new Error('Google OAuth is not configured on this server yet.')
  }
  const url = new URL(GOOGLE_AUTH_URL)
  url.searchParams.set('client_id', settings.clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', settings.scopes.join(' '))
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', stateToken)
  return url.toString()
}

function buildMicrosoftAuthUrl(stateToken: string, redirectUri: string) {
  const settings = getMicrosoftOAuthSettings()
  if (!microsoftOAuthAvailable()) {
    throw new Error('Microsoft OAuth is not configured on this server yet.')
  }
  const url = new URL(settings.authUrl)
  url.searchParams.set('client_id', settings.clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', settings.scopes.join(' '))
  url.searchParams.set('prompt', 'select_account')
  url.searchParams.set('state', stateToken)
  return url.toString()
}

async function assertContractorOwnsRFQ(userId: string, rfqId: string) {
  const row = (await db
    .select({
      rfqId: rfqs.id,
      title: rfqs.title,
      requestType: rfqs.request_type,
      email_subject: rfqs.email_subject,
      email_body: rfqs.email_body,
      bidDeadline: rfqs.bid_deadline,
      projectId: rfqs.project_id,
      publishedAt: rfqs.published_at,
      createdAt: rfqs.created_at,
      projectName: projects.name,
      projectLocation: projects.location,
      projectOwnerId: projects.owner_id,
    })
    .from(rfqs)
    .innerJoin(projects, eq(projects.id, rfqs.project_id))
    .where(eq(rfqs.id, rfqId)))[0]
  if (!row) throw new Error('RFQ not found')
  if (row.projectOwnerId !== userId) throw new Error('Not authorized for this RFQ')
  return row
}

async function getOffPlatformInvites(rfqId: string) {
  const rows = await db
    .select({
      email: rfqInvites.vendor_email,
      vendorName: rfqInvites.vendor_name,
      vendorFirstName: rfqInvites.vendor_first_name,
      vendorLastName: rfqInvites.vendor_last_name,
    })
    .from(rfqInvites)
    .where(and(eq(rfqInvites.rfq_id, rfqId), sql`${rfqInvites.vendor_email} IS NOT NULL`))
  return rows
    .filter((row) => row.email)
    .map((row) => ({
      email: row.email ?? '',
      vendorName: row.vendorName ?? [row.vendorFirstName, row.vendorLastName].filter(Boolean).join(' '),
    }))
}

async function upsertVendorRequest(userId: string, rfqId: string, vendorEmail: string, vendorName = '') {
  const normalizedEmail = vendorEmail.trim().toLowerCase()
  const existing = (await db
    .select()
    .from(rfqVendorRequests)
    .where(and(eq(rfqVendorRequests.rfq_id, rfqId), eq(rfqVendorRequests.vendor_email, normalizedEmail))))[0]
  const stamp = nowIso()
  if (existing) {
    await db.update(rfqVendorRequests)
      .set({
        contractor_user_id: userId,
        vendor_name: vendorName || existing.vendor_name,
        vendor_email_domain: emailDomain(normalizedEmail),
        updated_at: stamp,
      })
      .where(eq(rfqVendorRequests.id, existing.id))
    return (await db.select().from(rfqVendorRequests).where(eq(rfqVendorRequests.id, existing.id)))[0]!
  }
  await db.insert(rfqVendorRequests)
    .values({
      rfq_id: rfqId,
      contractor_user_id: userId,
      vendor_name: vendorName,
      vendor_email: normalizedEmail,
      vendor_email_domain: emailDomain(normalizedEmail),
      created_at: stamp,
      updated_at: stamp,
    })
  return (await db
    .select()
    .from(rfqVendorRequests)
    .where(and(eq(rfqVendorRequests.rfq_id, rfqId), eq(rfqVendorRequests.vendor_email, normalizedEmail))))[0]!
}

async function ensureVendorRequestsForRFQ(userId: string, rfqId: string) {
  const invites = await getOffPlatformInvites(rfqId)
  return Promise.all(invites.map((invite) => upsertVendorRequest(userId, rfqId, invite.email, invite.vendorName)))
}

function buildMimeMessage(params: {
  fromEmail: string
  fromName: string
  toEmail: string
  toName: string
  subject: string
  body: string
  attachmentName: string
  attachmentBytes: Buffer
}) {
  const boundaryMixed = `mix_${randomBytes(12).toString('hex')}`
  const boundaryAlt = `alt_${randomBytes(12).toString('hex')}`
  const domain = emailDomain(params.fromEmail) || 'local.rialto'
  const messageId = `<${randomUUID()}@${domain}>`
  const safeBody = params.body.trim()
  const htmlBody = renderEmailHtmlBody(safeBody)
  const attachmentBase64 = params.attachmentBytes.toString('base64')
  const raw = [
    'MIME-Version: 1.0',
    `From: ${params.fromName ? `"${params.fromName.replaceAll('"', '')}" ` : ''}<${params.fromEmail}>`,
    `To: ${params.toName ? `"${params.toName.replaceAll('"', '')}" ` : ''}<${params.toEmail}>`,
    `Subject: ${params.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
    '',
    `--${boundaryMixed}`,
    `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
    '',
    `--${boundaryAlt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    safeBody,
    '',
    `--${boundaryAlt}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
    `--${boundaryAlt}--`,
    `--${boundaryMixed}`,
    `Content-Type: application/pdf; name="${params.attachmentName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${params.attachmentName}"`,
    '',
    attachmentBase64,
    '',
    `--${boundaryMixed}--`,
    '',
  ].join('\r\n')
  return { raw, messageId, safeBody, htmlBody }
}

function buildReplyMimeMessage(params: {
  fromEmail: string
  fromName: string
  toEmail: string
  toName: string
  subject: string
  body: string
  inReplyTo?: string
  references?: string
}) {
  const domain = emailDomain(params.fromEmail) || 'local.rialto'
  const messageId = `<${randomUUID()}@${domain}>`
  const safeBody = params.body.trim()
  const htmlBody = renderEmailHtmlBody(safeBody)
  const headers = [
    `From: ${params.fromName} <${params.fromEmail}>`,
    `To: ${params.toName || params.toEmail} <${params.toEmail}>`,
    `Subject: ${params.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="alt_boundary"',
  ]
  if (params.inReplyTo) headers.push(`In-Reply-To: <${cleanMessageId(params.inReplyTo)}>`)
  if (params.references) headers.push(`References: <${cleanMessageId(params.references)}>`)
  const raw = [
    ...headers,
    '',
    '--alt_boundary',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    safeBody,
    '',
    '--alt_boundary',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
    '--alt_boundary--',
    '',
  ].join('\r\n')
  return { raw, messageId, safeBody, htmlBody }
}

async function sendGmailMessage(userId: string, rawMime: string, gmailThreadId = '') {
  const payload: Record<string, unknown> = {
    raw: Buffer.from(rawMime, 'utf8').toString('base64url'),
  }
  if (gmailThreadId) payload.threadId = gmailThreadId
  return googleApiRequest<{ id?: string; threadId?: string }>(userId, 'POST', '/messages/send', {
    body: payload,
  })
}

async function sendMicrosoftMessage(userId: string, params: {
  subject: string
  safeBody: string
  htmlBody: string
  toEmail: string
  toName: string
  attachmentName: string
  attachmentBytes: Buffer
  internetMessageId: string
}) {
  const draft = await microsoftGraphRequest<{
    id?: string
    conversationId?: string
    internetMessageId?: string
  }>(userId, 'POST', '/messages', {
    body: {
      subject: params.subject,
      body: {
        contentType: 'HTML',
        content: params.htmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: params.toEmail,
            name: params.toName || params.toEmail,
          },
        },
      ],
      attachments: [
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: params.attachmentName,
          contentType: 'application/pdf',
          contentBytes: params.attachmentBytes.toString('base64'),
        },
      ],
      internetMessageHeaders: [
        { name: 'Message-ID', value: params.internetMessageId },
      ],
    },
  })
  if (!draft.id) {
    throw new Error('Microsoft Graph did not return a draft message id.')
  }
  await microsoftGraphRequest(userId, 'POST', `/messages/${draft.id}/send`)
  return {
    id: draft.id,
    threadId: draft.conversationId ?? '',
    internetMessageId: cleanMessageId(draft.internetMessageId) || cleanMessageId(params.internetMessageId),
  }
}

async function sendMicrosoftThreadReply(userId: string, messageId: string, comment: string) {
  await microsoftGraphRequest(userId, 'POST', `/messages/${messageId}/reply`, {
    body: { comment },
  })
}

async function sendMicrosoftSimpleMessage(userId: string, params: {
  subject: string
  htmlBody: string
  toEmail: string
  toName: string
  internetMessageId: string
}) {
  const draft = await microsoftGraphRequest<{
    id?: string
    conversationId?: string
    internetMessageId?: string
  }>(userId, 'POST', '/messages', {
    body: {
      subject: params.subject,
      body: {
        contentType: 'HTML',
        content: params.htmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: params.toEmail,
            name: params.toName || params.toEmail,
          },
        },
      ],
      internetMessageHeaders: [
        { name: 'Message-ID', value: params.internetMessageId },
      ],
    },
  })
  if (!draft.id) {
    throw new Error('Microsoft Graph did not return a draft message id.')
  }
  await microsoftGraphRequest(userId, 'POST', `/messages/${draft.id}/send`)
  return {
    id: draft.id,
    threadId: draft.conversationId ?? '',
    internetMessageId: cleanMessageId(draft.internetMessageId) || cleanMessageId(params.internetMessageId),
  }
}

export { buildRFQEmailDraft, buildRFQEmailBody, buildRFQEmailSubject }

function serializeJson(value: unknown) {
  return JSON.stringify(value)
}

async function upsertEmailMessage(payload: {
  contractorUserId: string
  gmailMessageId: string
  gmailThreadId: string
  internetMessageId: string
  rfqId?: string
  vendorRequestId?: number
  direction: 'inbound' | 'outbound'
  matchStatus: string
  matchConfidence: number
  matchReason: string
  subject: string
  normalizedSubject: string
  fromEmail: string
  fromName: string
  toParticipants: Participant[]
  ccParticipants: Participant[]
  snippet: string
  textBody: string
  htmlBody: string
  sentAt: string
  isUnread: boolean
  labels: string[]
  rawPayload: unknown
}): Promise<number> {
  const existing = (await db
    .select()
    .from(rfqEmailMessages)
    .where(eq(rfqEmailMessages.gmail_message_id, payload.gmailMessageId)))[0]
  const stamp = nowIso()
  const patch = {
    contractor_user_id: payload.contractorUserId,
    gmail_message_id: payload.gmailMessageId,
    gmail_thread_id: payload.gmailThreadId,
    internet_message_id: payload.internetMessageId,
    rfq_id: payload.rfqId ?? null,
    vendor_request_id: payload.vendorRequestId ?? null,
    direction: payload.direction,
    match_status: payload.matchStatus,
    match_confidence: payload.matchConfidence,
    match_reason: payload.matchReason,
    subject: payload.subject,
    normalized_subject: payload.normalizedSubject,
    from_email: payload.fromEmail,
    from_name: payload.fromName,
    to_json: serializeJson(payload.toParticipants),
    cc_json: serializeJson(payload.ccParticipants),
    snippet: payload.snippet,
    text_body: payload.textBody,
    html_body: payload.htmlBody,
    sent_at: payload.sentAt,
    is_unread: payload.isUnread,
    label_json: serializeJson(payload.labels),
    raw_payload_json: serializeJson(payload.rawPayload),
    updated_at: stamp,
  }
  if (existing) {
    await db.update(rfqEmailMessages).set(patch).where(eq(rfqEmailMessages.id, existing.id))
    return existing.id
  }
  await db.insert(rfqEmailMessages).values({
    ...patch,
    created_at: stamp,
  })
  return (await db
    .select({ id: rfqEmailMessages.id })
    .from(rfqEmailMessages)
    .where(eq(rfqEmailMessages.gmail_message_id, payload.gmailMessageId)))[0]!.id
}

async function replaceEmailAttachments(
  emailMessageId: number,
  contractorUserId: string,
  attachments: Array<{ filename: string; mimeType: string; raw: Buffer }>,
) {
  const existing = await db
    .select()
    .from(rfqEmailAttachments)
    .where(eq(rfqEmailAttachments.email_message_id, emailMessageId))
  for (const row of existing) {
    if (row.file_path && fs.existsSync(row.file_path)) {
      fs.rmSync(row.file_path, { force: true })
    }
  }
  await db.delete(rfqEmailAttachments).where(eq(rfqEmailAttachments.email_message_id, emailMessageId))

  const targetDir = path.join(MAIL_ROOT, contractorUserId, String(emailMessageId))
  fs.mkdirSync(targetDir, { recursive: true })
  const stamp = nowIso()
  for (const attachment of attachments) {
    const safeName = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_') || `attachment-${randomUUID()}.bin`
    const filePath = path.join(targetDir, safeName)
    fs.writeFileSync(filePath, attachment.raw)
    const extracted = extractTextFromAttachment(safeName, attachment.mimeType, attachment.raw)
    await db.insert(rfqEmailAttachments).values({
      email_message_id: emailMessageId,
      filename: safeName,
      mime_type: attachment.mimeType,
      file_path: filePath,
      size_bytes: attachment.raw.length,
      extracted_text: extracted.text,
      extraction_confidence: extracted.confidence,
      source_kind: extracted.sourceKind,
      created_at: stamp,
      updated_at: stamp,
    })
  }
}

async function updateVendorRequestAfterMessage(
  vendorRequestId: number,
  direction: 'inbound' | 'outbound',
  gmailThreadId: string,
  sentAt: string,
  status: string,
  matchBasis: string,
) {
  await db.update(rfqVendorRequests)
    .set({
      gmail_thread_id: gmailThreadId || sql`${rfqVendorRequests.gmail_thread_id}`,
      last_message_at: sentAt,
      last_message_direction: direction,
      status,
      match_basis: matchBasis,
      updated_at: nowIso(),
    })
    .where(eq(rfqVendorRequests.id, vendorRequestId))
}

async function upsertReviewTask(params: {
  contractorUserId: string
  rfqId?: string
  vendorRequestId?: number
  emailMessageId?: number
  quoteResponseId?: number
  taskType: string
  title: string
  details: Record<string, unknown>
}): Promise<number> {
  const existing = (await db
    .select({ id: rfqReviewTasks.id })
    .from(rfqReviewTasks)
    .where(
      and(
        eq(rfqReviewTasks.status, 'open'),
        eq(rfqReviewTasks.task_type, params.taskType),
        sql`ifnull(${rfqReviewTasks.email_message_id}, 0) = ifnull(${params.emailMessageId ?? null}, 0)`,
        sql`ifnull(${rfqReviewTasks.quote_response_id}, 0) = ifnull(${params.quoteResponseId ?? null}, 0)`,
      ),
    ))[0]
  const stamp = nowIso()
  if (existing) {
    await db.update(rfqReviewTasks)
      .set({
        title: params.title,
        details_json: serializeJson(params.details),
        updated_at: stamp,
      })
      .where(eq(rfqReviewTasks.id, existing.id))
    return existing.id
  }
  await db.insert(rfqReviewTasks).values({
    contractor_user_id: params.contractorUserId,
    rfq_id: params.rfqId ?? null,
    vendor_request_id: params.vendorRequestId ?? null,
    email_message_id: params.emailMessageId ?? null,
    quote_response_id: params.quoteResponseId ?? null,
    task_type: params.taskType,
    title: params.title,
    details_json: serializeJson(params.details),
    created_at: stamp,
    updated_at: stamp,
  })
  return (await db.select({ id: rfqReviewTasks.id }).from(rfqReviewTasks).orderBy(desc(rfqReviewTasks.id)))[0]!.id
}

async function closeRelatedReviewTasks(params: { emailMessageId?: number; quoteResponseId?: number }) {
  const stamp = nowIso()
  if (params.emailMessageId) {
    await db.update(rfqReviewTasks)
      .set({ status: 'resolved', updated_at: stamp })
      .where(and(eq(rfqReviewTasks.email_message_id, params.emailMessageId), eq(rfqReviewTasks.status, 'open')))
  }
  if (params.quoteResponseId) {
    await db.update(rfqReviewTasks)
      .set({ status: 'resolved', updated_at: stamp })
      .where(and(eq(rfqReviewTasks.quote_response_id, params.quoteResponseId), eq(rfqReviewTasks.status, 'open')))
  }
}

async function bestVendorRequestMatch(
  userId: string,
  fromEmail: string,
  normalizedSubject: string,
  sentAt: string,
  gmailThreadId: string,
) {
  const exactThread = (await db
    .select({
      id: rfqVendorRequests.id,
      rfqId: rfqVendorRequests.rfq_id,
      vendorEmail: rfqVendorRequests.vendor_email,
      vendorName: rfqVendorRequests.vendor_name,
      vendorEmailDomain: rfqVendorRequests.vendor_email_domain,
      gmailThreadId: rfqVendorRequests.gmail_thread_id,
      lastMessageAt: rfqVendorRequests.last_message_at,
      rfqTitle: rfqs.title,
      rfqPublishedAt: rfqs.published_at,
      rfqCreatedAt: rfqs.created_at,
    })
    .from(rfqVendorRequests)
    .innerJoin(rfqs, eq(rfqs.id, rfqVendorRequests.rfq_id))
    .where(and(eq(rfqVendorRequests.contractor_user_id, userId), eq(rfqVendorRequests.gmail_thread_id, gmailThreadId))))[0]
  if (exactThread) {
    return { row: exactThread, score: 0.99, reason: 'gmail_thread' }
  }

  const domain = emailDomain(fromEmail)
  const rows = await db
    .select({
      id: rfqVendorRequests.id,
      rfqId: rfqVendorRequests.rfq_id,
      vendorEmail: rfqVendorRequests.vendor_email,
      vendorName: rfqVendorRequests.vendor_name,
      vendorEmailDomain: rfqVendorRequests.vendor_email_domain,
      gmailThreadId: rfqVendorRequests.gmail_thread_id,
      lastMessageAt: rfqVendorRequests.last_message_at,
      rfqTitle: rfqs.title,
      rfqPublishedAt: rfqs.published_at,
      rfqCreatedAt: rfqs.created_at,
    })
    .from(rfqVendorRequests)
    .innerJoin(rfqs, eq(rfqs.id, rfqVendorRequests.rfq_id))
    .where(
      and(
        eq(rfqVendorRequests.contractor_user_id, userId),
        or(eq(rfqVendorRequests.vendor_email, fromEmail), eq(rfqVendorRequests.vendor_email_domain, domain)),
      ),
    )

  let bestRow: typeof rows[number] | undefined
  let bestScore = 0
  let bestReason = ''
  const sentDate = new Date(sentAt)
  for (const row of rows) {
    let score = 0
    const reasons: string[] = []
    if (row.vendorEmail === fromEmail) {
      score += 0.65
      reasons.push('exact_email')
    } else if (row.vendorEmailDomain && row.vendorEmailDomain === domain) {
      score += 0.38
      reasons.push('domain')
    }
    const rfqSubject = normalizeSubject(buildRFQEmailSubject(row.rfqTitle))
    if (normalizedSubject && rfqSubject) {
      if (normalizedSubject === rfqSubject) {
        score += 0.28
        reasons.push('subject_exact')
      } else {
        const subjectTokens = tokenize(normalizedSubject)
        const rfqTokens = tokenize(rfqSubject)
        const overlap = [...subjectTokens].filter((token) => rfqTokens.has(token)).length
        if (overlap >= 2) {
          score += Math.min(0.22, overlap * 0.06)
          reasons.push('subject_overlap')
        }
      }
    }
    const anchorDate = new Date(row.lastMessageAt || row.rfqPublishedAt || row.rfqCreatedAt)
    if (Number.isFinite(anchorDate.getTime()) && Number.isFinite(sentDate.getTime())) {
      const days = Math.abs((sentDate.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24))
      if (days <= MATCH_WINDOW_DAYS) {
        score += 0.1
        reasons.push('recent')
      }
    }
    if (score > bestScore) {
      bestRow = row
      bestScore = score
      bestReason = reasons.join(',')
    }
  }
  return { row: bestRow, score: bestScore, reason: bestReason }
}

async function getRfqLineItemLookup(rfqId: string) {
  const rows = await db
    .select({
      id: rfqLineItems.id,
      requestedText: rfqLineItems.description,
      normalizedName: rfqLineItems.specs,
      quantity: rfqLineItems.quantity,
      unit: rfqLineItems.unit,
      sku: rfqLineItems.sku,
      description: rfqLineItems.description,
    })
    .from(rfqLineItems)
    .where(eq(rfqLineItems.rfq_id, rfqId))
  return rows.map((row) => ({
    ...row,
    normalizedName: row.normalizedName || row.description,
  }))
}

async function projectQuoteResponseToBid(rfqId: string, vendorRequestId: number, vendorName: string, vendorEmail: string, status: ContractorBid['status']) {
  const quoteLineRows = await db
    .select()
    .from(rfqQuoteLineItems)
    .innerJoin(rfqQuoteResponses, eq(rfqQuoteResponses.id, rfqQuoteLineItems.quote_response_id))
    .where(eq(rfqQuoteResponses.vendor_request_id, vendorRequestId))
    .orderBy(desc(rfqQuoteResponses.updated_at), desc(rfqQuoteLineItems.id))

  const byLineItem = new Map<string, typeof quoteLineRows[number]>()
  for (const row of quoteLineRows) {
    const lineItemId = row.rfq_quote_line_items.rfq_line_item_id
    if (!lineItemId || byLineItem.has(lineItemId)) continue
    byLineItem.set(lineItemId, row)
  }

  if (byLineItem.size === 0) return

  const rfqItemRows = await db
    .select()
    .from(rfqLineItems)
    .where(eq(rfqLineItems.rfq_id, rfqId))
  const responses = rfqItemRows
    .map((item) => {
      const matched = byLineItem.get(item.id)
      if (!matched) return null
      const quoteLine = matched.rfq_quote_line_items
      const unitPrice = parseNumber(quoteLine.unit_price)
      const totalPrice = parseNumber(quoteLine.total_price) ?? (unitPrice != null ? unitPrice * item.quantity : undefined)
      if (unitPrice == null && totalPrice == null) return null
      return {
        line_item_id: item.id,
        sku: item.sku ?? '',
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: unitPrice ?? (totalPrice != null ? totalPrice / Math.max(item.quantity, 1) : 0),
        total_price: totalPrice ?? 0,
        lead_time_days: parseLeadTimeDays(quoteLine.lead_time_text) ?? 0,
        availability: 'can_source' as const,
        units_available: undefined,
        notes: quoteLine.notes || undefined,
        quoted_product_details: quoteLine.notes || undefined,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  if (responses.length === 0) return

  const totalPrice = responses.reduce((sum, response) => sum + response.total_price, 0)
  const leadTimeDays = responses.reduce((max, response) => Math.max(max, response.lead_time_days), 0)
  const submittedAtRow = (await db
    .select({ sentAt: rfqEmailMessages.sent_at })
    .from(rfqEmailMessages)
    .innerJoin(rfqQuoteResponses, eq(rfqQuoteResponses.email_message_id, rfqEmailMessages.id))
    .where(eq(rfqQuoteResponses.vendor_request_id, vendorRequestId))
    .orderBy(desc(rfqEmailMessages.sent_at)))[0]
  const submittedAt = submittedAtRow?.sentAt ?? nowIso()

  const bidId = `bid-email-vr-${vendorRequestId}`
  await db.insert(bids).values({
    id: bidId,
    rfq_id: rfqId,
    vendor_id: null,
    vendor_email: vendorEmail,
    vendor_name: vendorName || vendorEmail,
    is_invited: true,
    is_on_platform: false,
    submitted_at: submittedAt,
    total_price: totalPrice,
    currency: 'USD',
    lead_time_days: leadTimeDays,
    notes: status === 'under_review' ? 'Email-origin quote needs review.' : null,
    status,
    is_draft: false,
    source: 'email',
  }).onConflictDoUpdate({
    target: bids.id,
    set: {
      vendor_email: vendorEmail,
      vendor_name: vendorName || vendorEmail,
      submitted_at: submittedAt,
      total_price: totalPrice,
      lead_time_days: leadTimeDays,
      notes: status === 'under_review' ? 'Email-origin quote needs review.' : null,
      status,
      source: 'email',
      is_on_platform: false,
      is_invited: true,
    },
  })

  await db.delete(bidLineItems).where(eq(bidLineItems.bid_id, bidId))
  await db.insert(bidLineItems).values(
    responses.map((response) => ({
      bid_id: bidId,
      line_item_id: response.line_item_id,
      sku: response.sku || null,
      description: response.description,
      quantity: response.quantity,
      unit: response.unit,
      unit_price: response.unit_price,
      total_price: response.total_price,
      lead_time_days: response.lead_time_days,
      availability: response.availability,
      units_available: response.units_available ?? null,
      delivery_terms: null,
      notes: response.notes ?? null,
      quoted_product_details: response.quoted_product_details ?? null,
    })),
  )
  await runBidSpecCompliance(bidId).catch((error) => {
    console.error('Spec compliance review failed:', error)
  })
}

async function parseQuoteResponseForEmail(params: {
  contractorUserId: string
  emailMessageId: number
  rfqId: string
  vendorRequestId: number
  vendorName: string
  vendorEmail: string
  forceNeedsReview?: boolean
}) {
  const emailRow = (await db.select().from(rfqEmailMessages).where(eq(rfqEmailMessages.id, params.emailMessageId)))[0]
  if (!emailRow) return

  const rfqItems = await getRfqLineItemLookup(params.rfqId)
  const attachmentRows = await db
    .select({
      extractedText: rfqEmailAttachments.extracted_text,
      sourceKind: rfqEmailAttachments.source_kind,
    })
    .from(rfqEmailAttachments)
    .where(eq(rfqEmailAttachments.email_message_id, params.emailMessageId))

  const bodyLines = parseQuoteLines(emailRow.text_body)
  const attachmentLines = attachmentRows.flatMap((row) => parseQuoteLines(row.extractedText))
  const allLines = attachmentLines.length > 0 ? attachmentLines : bodyLines
  if (allLines.length === 0) {
    await upsertReviewTask({
      contractorUserId: params.contractorUserId,
      rfqId: params.rfqId,
      vendorRequestId: params.vendorRequestId,
      emailMessageId: params.emailMessageId,
      taskType: 'quote_parse',
      title: 'Review quote response that could not be parsed automatically',
      details: { reason: 'No quote line items were extracted from the email or its attachments.' },
    })
    return
  }

  const leadTime = emailRow.text_body.match(/(\d+\s*(?:day|days|week|weeks|business days))/i)?.[1] ?? ''
  const stamp = nowIso()
  const sourceKind = attachmentRows[0]?.sourceKind ?? 'email'
  const existing = (await db
    .select()
    .from(rfqQuoteResponses)
    .where(eq(rfqQuoteResponses.email_message_id, params.emailMessageId)))[0]

  let quoteResponseId: number
  if (existing) {
    quoteResponseId = existing.id
    await db.update(rfqQuoteResponses)
      .set({
        rfq_id: params.rfqId,
        vendor_request_id: params.vendorRequestId,
        source_kind: sourceKind,
        status: 'parsed',
        confidence: 0.6,
        lead_time_text: leadTime,
        updated_at: stamp,
      })
      .where(eq(rfqQuoteResponses.id, quoteResponseId))
    await db.delete(rfqQuoteLineItems).where(eq(rfqQuoteLineItems.quote_response_id, quoteResponseId))
  } else {
    await db.insert(rfqQuoteResponses).values({
      rfq_id: params.rfqId,
      vendor_request_id: params.vendorRequestId,
      email_message_id: params.emailMessageId,
      source_kind: sourceKind,
      status: 'parsed',
      confidence: 0.6,
      currency: 'USD',
      lead_time_text: leadTime,
      notes: '',
      created_at: stamp,
      updated_at: stamp,
    })
    quoteResponseId = (await db
      .select({ id: rfqQuoteResponses.id })
      .from(rfqQuoteResponses)
      .where(eq(rfqQuoteResponses.email_message_id, params.emailMessageId)))[0]!.id
  }

  let lowConfidence = Boolean(params.forceNeedsReview)
  for (const line of allLines) {
    const matched = matchQuoteLineItem(rfqItems, line.sourceName)
    const confidence = Math.min(0.95, 0.42 + matched.confidence * 0.45 + (line.unitPrice ? 0.08 : 0))
    if (!matched.rfqLineItemId || confidence < 0.6) {
      lowConfidence = true
    }
    await db.insert(rfqQuoteLineItems).values({
      quote_response_id: quoteResponseId,
      rfq_line_item_id: matched.rfqLineItemId ?? null,
      source_name: line.sourceName,
      normalized_name: line.sourceName,
      quantity: line.quantity,
      unit: line.unit,
      unit_price: line.unitPrice,
      total_price: line.totalPrice,
      lead_time_text: line.leadTimeText,
      notes: line.notes,
      confidence,
      created_at: stamp,
      updated_at: stamp,
    })
  }

  if (lowConfidence) {
    await db.update(rfqQuoteResponses)
      .set({ status: 'needs_review', confidence: 0.45, updated_at: stamp })
      .where(eq(rfqQuoteResponses.id, quoteResponseId))
    await upsertReviewTask({
      contractorUserId: params.contractorUserId,
      rfqId: params.rfqId,
      vendorRequestId: params.vendorRequestId,
      emailMessageId: params.emailMessageId,
      quoteResponseId,
      taskType: 'quote_line_match',
      title: 'Review low-confidence quote line item matches',
      details: { reason: 'At least one parsed quote line item could not be confidently matched to an RFQ material.' },
    })
    await projectQuoteResponseToBid(params.rfqId, params.vendorRequestId, params.vendorName, params.vendorEmail, 'under_review')
  } else {
    await db.update(rfqQuoteResponses)
      .set({ status: 'compared', confidence: 0.82, updated_at: stamp })
      .where(eq(rfqQuoteResponses.id, quoteResponseId))
    await closeRelatedReviewTasks({ emailMessageId: params.emailMessageId, quoteResponseId })
    await projectQuoteResponseToBid(params.rfqId, params.vendorRequestId, params.vendorName, params.vendorEmail, 'pending')
  }
}

async function processGmailThread(userId: string, threadPayload: Record<string, unknown>) {
  const mailbox = await getMailboxRow(userId)
  const accountEmail = mailbox.email_address.toLowerCase()
  const gmailThreadId = String(threadPayload.id ?? '')
  const messages = Array.isArray(threadPayload.messages) ? threadPayload.messages as Array<Record<string, unknown>> : []

  for (const gmailMessage of messages) {
    const payload = (gmailMessage.payload as Record<string, unknown> | undefined) ?? {}
    const headers = buildHeaderMap(payload)
    const bodies = extractGmailBodies(payload)
    const fromEmail = primaryEmail(headers.from ?? '')
    const direction = fromEmail === accountEmail ? 'outbound' : 'inbound'
    const labels = Array.isArray(gmailMessage.labelIds) ? gmailMessage.labelIds.map(String) : []
    const sentAt = isoFromGmailMessage(headers, typeof gmailMessage.internalDate === 'string' ? gmailMessage.internalDate : undefined)
    const subject = headers.subject ?? ''
    const normalizedSubject = normalizeSubject(subject)

    let matchStatus = 'matched'
    let matchConfidence = 0
    let matchReason = ''
    let rfqId: string | undefined
    let vendorRequestId: number | undefined
    let vendorName = ''
    let vendorEmail = ''

    if (direction === 'outbound') {
      const exactRow = (await db
        .select()
        .from(rfqVendorRequests)
        .where(and(eq(rfqVendorRequests.contractor_user_id, userId), eq(rfqVendorRequests.gmail_thread_id, gmailThreadId))))[0]
      if (exactRow) {
        rfqId = exactRow.rfq_id
        vendorRequestId = exactRow.id
        vendorName = exactRow.vendor_name
        vendorEmail = exactRow.vendor_email
        matchConfidence = 0.99
        matchReason = 'gmail_thread'
      } else {
        const matched = await bestVendorRequestMatch(userId, fromEmail, normalizedSubject, sentAt, gmailThreadId)
        if (matched.row) {
          rfqId = matched.row.rfqId
          vendorRequestId = matched.row.id
          vendorName = matched.row.vendorName
          vendorEmail = matched.row.vendorEmail
          matchConfidence = matched.score
          matchReason = matched.reason
        } else {
          matchStatus = 'unassigned'
        }
      }
    } else {
      const matched = await bestVendorRequestMatch(userId, fromEmail, normalizedSubject, sentAt, gmailThreadId)
      if (matched.row) {
        rfqId = matched.row.rfqId
        vendorRequestId = matched.row.id
        vendorName = matched.row.vendorName
        vendorEmail = matched.row.vendorEmail
        matchConfidence = matched.score
        matchReason = matched.reason
        if (matched.score < 0.82) {
          matchStatus = 'needs_review'
        }
      } else {
        matchStatus = 'needs_review'
      }
    }

    const emailMessageId = await upsertEmailMessage({
      contractorUserId: userId,
      gmailMessageId: String(gmailMessage.id ?? ''),
      gmailThreadId,
      internetMessageId: cleanMessageId(headers['message-id']),
      rfqId,
      vendorRequestId,
      direction,
      matchStatus,
      matchConfidence,
      matchReason,
      subject,
      normalizedSubject,
      fromEmail,
      fromName: displayName(headers.from ?? ''),
      toParticipants: parseParticipants(headers.to ?? ''),
      ccParticipants: parseParticipants(headers.cc ?? ''),
      snippet: String(gmailMessage.snippet ?? ''),
      textBody: bodies.textBody,
      htmlBody: bodies.htmlBody,
      sentAt,
      isUnread: labels.includes('UNREAD') && direction === 'inbound',
      labels,
      rawPayload: payload,
    })

    const inboundAttachments: Array<{ filename: string; mimeType: string; raw: Buffer }> = []
    for (const descriptor of attachmentDescriptors(payload)) {
      let raw = Buffer.alloc(0)
      if (descriptor.attachmentId) {
        raw = await fetchGmailAttachment(userId, String(gmailMessage.id ?? ''), descriptor.attachmentId)
      } else if (descriptor.inlineData) {
        raw = decodeBase64UrlBytes(descriptor.inlineData)
      }
      if (raw.length > 0) {
        inboundAttachments.push({
          filename: descriptor.filename || `attachment-${randomUUID()}.bin`,
          mimeType: descriptor.mimeType,
          raw,
        })
      }
    }
    await replaceEmailAttachments(emailMessageId, userId, inboundAttachments)

    if (vendorRequestId) {
      await updateVendorRequestAfterMessage(
        vendorRequestId,
        direction as 'inbound' | 'outbound',
        gmailThreadId,
        sentAt,
        direction === 'inbound' ? 'replied' : 'sent',
        matchReason,
      )
    }

    if (direction === 'inbound') {
      if (rfqId && vendorRequestId) {
        if (matchStatus === 'needs_review') {
          await upsertReviewTask({
            contractorUserId: userId,
            rfqId,
            vendorRequestId,
            emailMessageId,
            taskType: 'email_match',
            title: 'Review inbound vendor email match',
            details: {
              reason: 'This inbound email could not be confidently linked to a single RFQ vendor request.',
              matchConfidence,
              matchReason,
            },
          })
        }
        await parseQuoteResponseForEmail({
          contractorUserId: userId,
          emailMessageId,
          rfqId,
          vendorRequestId,
          vendorName,
          vendorEmail: vendorEmail || fromEmail,
          forceNeedsReview: matchStatus === 'needs_review',
        })
      } else {
        await upsertReviewTask({
          contractorUserId: userId,
          rfqId,
          vendorRequestId,
          emailMessageId,
          taskType: 'email_match',
          title: 'Review inbound vendor email match',
          details: {
            reason: 'This inbound email could not be confidently linked to a single RFQ vendor request.',
            matchConfidence,
            matchReason,
          },
        })
      }
    }
  }
}

function stripHtmlTags(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function graphParticipants(value: unknown): Participant[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      const emailAddress = typeof entry === 'object' && entry ? (entry as Record<string, unknown>).emailAddress : null
      const address = typeof emailAddress === 'object' && emailAddress ? String((emailAddress as Record<string, unknown>).address ?? '') : ''
      const name = typeof emailAddress === 'object' && emailAddress ? String((emailAddress as Record<string, unknown>).name ?? '') : ''
      return {
        email: address.trim().toLowerCase(),
        name: name.trim(),
      }
    })
    .filter((participant) => participant.email)
}

async function fetchMicrosoftMessageAttachments(userId: string, messageId: string) {
  const response = await microsoftGraphRequest<{ value?: Array<Record<string, unknown>> }>(
    userId,
    'GET',
    `/messages/${messageId}/attachments`,
    { query: { '$top': 50 } },
  )
  const attachments: Array<{ filename: string; mimeType: string; raw: Buffer }> = []
  for (const item of response.value ?? []) {
    const contentBytes = typeof item.contentBytes === 'string' ? item.contentBytes : ''
    if (!contentBytes) continue
    attachments.push({
      filename: String(item.name ?? `attachment-${randomUUID()}.bin`),
      mimeType: String(item.contentType ?? 'application/octet-stream'),
      raw: Buffer.from(contentBytes, 'base64'),
    })
  }
  return attachments
}

async function listRecentMicrosoftMessages(userId: string, sinceCursor = '', limit = RECENT_THREAD_LIMIT) {
  const query: Record<string, string | number | boolean | string[]> = {
    '$top': Math.min(100, limit),
    '$orderby': 'receivedDateTime desc',
    '$select': [
      'id',
      'conversationId',
      'internetMessageId',
      'subject',
      'from',
      'toRecipients',
      'ccRecipients',
      'body',
      'bodyPreview',
      'receivedDateTime',
      'sentDateTime',
      'isRead',
      'hasAttachments',
    ],
  }
  if (sinceCursor) {
    query['$filter'] = `receivedDateTime ge ${sinceCursor}`
  }
  const response = await microsoftGraphRequest<{ value?: Array<Record<string, unknown>> }>(userId, 'GET', '/messages', { query })
  return response.value ?? []
}

async function processMicrosoftMessage(userId: string, message: Record<string, unknown>) {
  const mailbox = await getMailboxRow(userId)
  const accountEmail = mailbox.email_address.toLowerCase()
  const from = typeof message.from === 'object' && message.from ? (message.from as Record<string, unknown>) : {}
  const fromAddress = typeof from.emailAddress === 'object' && from.emailAddress
    ? (from.emailAddress as Record<string, unknown>)
    : {}
  const fromEmail = String(fromAddress.address ?? '').trim().toLowerCase()
  const fromName = String(fromAddress.name ?? '').trim()
  const providerThreadId = String(message.conversationId ?? '')
  const subject = String(message.subject ?? '')
  const normalizedSubject = normalizeSubject(subject)
  const sentAt = String(message.receivedDateTime ?? message.sentDateTime ?? nowIso())
  const htmlBody = typeof message.body === 'object' && message.body
    ? String(((message.body as Record<string, unknown>).content) ?? '')
    : ''
  const textBody = stripHtmlTags(htmlBody) || String(message.bodyPreview ?? '')
  const direction = fromEmail === accountEmail ? 'outbound' : 'inbound'

  let matchStatus = 'matched'
  let matchConfidence = 0
  let matchReason = ''
  let rfqId: string | undefined
  let vendorRequestId: number | undefined
  let vendorName = ''
  let vendorEmail = ''

  if (direction === 'outbound') {
    const exactRow = (await db
      .select()
      .from(rfqVendorRequests)
      .where(and(eq(rfqVendorRequests.contractor_user_id, userId), eq(rfqVendorRequests.gmail_thread_id, providerThreadId))))[0]
    if (exactRow) {
      rfqId = exactRow.rfq_id
      vendorRequestId = exactRow.id
      vendorName = exactRow.vendor_name
      vendorEmail = exactRow.vendor_email
      matchConfidence = 0.99
      matchReason = 'provider_thread'
    } else {
      matchStatus = 'unassigned'
    }
  } else {
    const matched = await bestVendorRequestMatch(userId, fromEmail, normalizedSubject, sentAt, providerThreadId)
    if (matched.row) {
      rfqId = matched.row.rfqId
      vendorRequestId = matched.row.id
      vendorName = matched.row.vendorName
      vendorEmail = matched.row.vendorEmail
      matchConfidence = matched.score
      matchReason = matched.reason || 'provider_thread'
      if (matched.score < 0.82) matchStatus = 'needs_review'
    } else {
      matchStatus = 'needs_review'
    }
  }

  const emailMessageId = await upsertEmailMessage({
    contractorUserId: userId,
    gmailMessageId: String(message.id ?? ''),
    gmailThreadId: providerThreadId,
    internetMessageId: cleanMessageId(String(message.internetMessageId ?? '')),
    rfqId,
    vendorRequestId,
    direction,
    matchStatus,
    matchConfidence,
    matchReason,
    subject,
    normalizedSubject,
    fromEmail,
    fromName,
    toParticipants: graphParticipants(message.toRecipients),
    ccParticipants: graphParticipants(message.ccRecipients),
    snippet: String(message.bodyPreview ?? '').slice(0, 200),
    textBody,
    htmlBody,
    sentAt,
    isUnread: !Boolean(message.isRead) && direction === 'inbound',
    labels: [direction === 'inbound' ? 'INBOX' : 'SENT'],
    rawPayload: message,
  })

  const attachments = Boolean(message.hasAttachments)
    ? await fetchMicrosoftMessageAttachments(userId, String(message.id ?? ''))
    : []
  await replaceEmailAttachments(emailMessageId, userId, attachments)

  if (vendorRequestId) {
    await updateVendorRequestAfterMessage(
      vendorRequestId,
      direction as 'inbound' | 'outbound',
      providerThreadId,
      sentAt,
      direction === 'inbound' ? 'replied' : 'sent',
      matchReason || 'provider_thread',
    )
  }

  if (direction === 'inbound') {
    if (rfqId && vendorRequestId) {
      if (matchStatus === 'needs_review') {
        await upsertReviewTask({
          contractorUserId: userId,
          rfqId,
          vendorRequestId,
          emailMessageId,
          taskType: 'email_match',
          title: 'Review inbound vendor email match',
          details: {
            reason: 'This inbound email could not be confidently linked to a single RFQ vendor request.',
            matchConfidence,
            matchReason,
          },
        })
      }
      await parseQuoteResponseForEmail({
        contractorUserId: userId,
        emailMessageId,
        rfqId,
        vendorRequestId,
        vendorName,
        vendorEmail: vendorEmail || fromEmail,
        forceNeedsReview: matchStatus === 'needs_review',
      })
    }
  }
}

async function attachmentSummaryForMessage(emailMessageId: number): Promise<RFQEmailAttachmentSummary[]> {
  const rows = await db
    .select()
    .from(rfqEmailAttachments)
    .where(eq(rfqEmailAttachments.email_message_id, emailMessageId))
  return rows.map((row) => {
    const relativePath = path.relative(path.join(process.cwd(), '.local', 'uploads'), row.file_path).split(path.sep).join('/')
    return {
      id: row.id,
      filename: row.filename,
      mimeType: row.mime_type,
      url: `/api/files/${relativePath}`,
      sourceKind: row.source_kind,
    }
  })
}

async function reviewTaskSummaryForRow(row: typeof rfqReviewTasks.$inferSelect): Promise<RFQReviewTaskSummary> {
  const sourceMessageRow = row.email_message_id
    ? (await db.select().from(rfqEmailMessages).where(eq(rfqEmailMessages.id, row.email_message_id)))[0]
    : null
  const sourceMessage = sourceMessageRow ? await emailMessageSummaryForRow(sourceMessageRow) : undefined
  return {
    id: row.id,
    taskType: row.task_type,
    status: row.status,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    emailMessageId: row.email_message_id ?? undefined,
    quoteResponseId: row.quote_response_id ?? undefined,
    details: row.details_json ? JSON.parse(row.details_json) : {},
    sourceMessage,
  }
}

async function vendorRequestSummaryForRow(row: typeof rfqVendorRequests.$inferSelect): Promise<RFQVendorRequestSummary> {
  const magicLink = (await db
    .select()
    .from(rfqMagicLinks)
    .where(eq(rfqMagicLinks.vendor_request_id, row.id)))[0]

  return {
    id: row.id,
    vendorName: row.vendor_name || row.vendor_email,
    vendorEmail: row.vendor_email,
    status: row.status,
    magicFormExpiresAt: magicLink?.expires_at || undefined,
    magicFormFirstOpenedAt: magicLink?.first_opened_at || undefined,
    magicFormLastSubmittedAt: magicLink?.last_submitted_at || undefined,
    providerThreadId: row.gmail_thread_id || undefined,
    outboundMessageId: row.outbound_message_id || undefined,
    lastMessageAt: row.last_message_at || undefined,
    lastMessageDirection: row.last_message_direction || undefined,
    matchBasis: row.match_basis || undefined,
  }
}

async function emailMessageSummaryForRow(row: typeof rfqEmailMessages.$inferSelect): Promise<RFQEmailMessageSummary> {
  return {
    id: row.id,
    direction: row.direction as 'inbound' | 'outbound',
    matchStatus: row.match_status,
    matchConfidence: row.match_confidence,
    matchReason: row.match_reason || undefined,
    subject: row.subject,
    fromEmail: row.from_email,
    fromName: row.from_name || undefined,
    snippet: row.snippet,
    textBody: row.text_body || undefined,
    sentAt: row.sent_at,
    isUnread: row.is_unread,
    attachments: await attachmentSummaryForMessage(row.id),
  }
}

export async function getContractorMailboxSummary(userId: string) {
  return buildMailboxSummary((await db.select().from(contractorMailboxes).where(eq(contractorMailboxes.user_id, userId)))[0])
}

export const getMailboxSummary = getContractorMailboxSummary

export async function getRFQEmailWorkflowSummary(userId: string, rfqId: string): Promise<RFQEmailWorkflowSummary> {
  const mailbox = await getContractorMailboxSummary(userId)
  const vendorRequests = await db
    .select()
    .from(rfqVendorRequests)
    .where(and(eq(rfqVendorRequests.contractor_user_id, userId), eq(rfqVendorRequests.rfq_id, rfqId)))
    .orderBy(desc(rfqVendorRequests.updated_at), desc(rfqVendorRequests.id))
  const recentMessages = await db
    .select()
    .from(rfqEmailMessages)
    .where(and(eq(rfqEmailMessages.contractor_user_id, userId), eq(rfqEmailMessages.rfq_id, rfqId)))
    .orderBy(desc(rfqEmailMessages.sent_at), desc(rfqEmailMessages.id))
    .limit(12)
  const reviewTasks = await db
    .select()
    .from(rfqReviewTasks)
    .where(and(eq(rfqReviewTasks.contractor_user_id, userId), eq(rfqReviewTasks.rfq_id, rfqId), eq(rfqReviewTasks.status, 'open')))
    .orderBy(desc(rfqReviewTasks.created_at), desc(rfqReviewTasks.id))
  const offPlatformInviteCount = (await getOffPlatformInvites(rfqId)).length
  return {
    mailbox,
    sendableOffPlatformInviteCount: offPlatformInviteCount,
    sentVendorCount: vendorRequests.filter((row) => row.status !== 'draft').length,
    openedVendorCount: vendorRequests.filter((row) => row.status === 'opened' || row.status === 'submitted').length,
    submittedVendorCount: vendorRequests.filter((row) => row.status === 'submitted').length,
    repliedVendorCount: vendorRequests.filter((row) => row.last_message_direction === 'inbound').length,
    reviewTaskCount: reviewTasks.length,
    vendorRequests: await Promise.all(vendorRequests.map(vendorRequestSummaryForRow)),
    recentMessages: await Promise.all(recentMessages.map(emailMessageSummaryForRow)),
    reviewTasks: await Promise.all(reviewTasks.map(reviewTaskSummaryForRow)),
  }
}

export function beginGoogleOAuth(redirectUri: string) {
  const stateToken = randomBytes(24).toString('base64url')
  return { stateToken, location: buildGoogleAuthUrl(stateToken, redirectUri) }
}

export function beginMicrosoftOAuth(redirectUri: string) {
  const stateToken = randomBytes(24).toString('base64url')
  return { stateToken, location: buildMicrosoftAuthUrl(stateToken, redirectUri) }
}

async function completeOAuthCallback(provider: MailProvider, code: string, redirectUri?: string) {
  const settings = getOAuthSettings(provider)
  const token = await exchangeOAuthCode(provider, code, redirectUri ?? settings.redirectUri)
  const accessToken = String(token.access_token ?? '')
  if (!accessToken) {
    throw new Error(`${providerLabel(provider)} did not return an access token.`)
  }
  const profile = provider === 'microsoft_365'
    ? await fetchMicrosoftProfileWithAccessToken(accessToken)
    : await fetchGoogleProfileWithAccessToken(accessToken)
  const emailAddress = String(
    provider === 'microsoft_365'
      ? (profile.mail ?? profile.userPrincipalName ?? '')
      : (profile.emailAddress ?? ''),
  ).trim().toLowerCase()
  if (!emailAddress) {
    throw new Error(`${providerLabel(provider)} did not return an email address for this account.`)
  }
  const existingUser = await findUserByEmail(emailAddress)
  if (existingUser && existingUser.role !== 'contractor') {
    throw new Error(`${providerLabel(provider)} sign-in is only available for contractor accounts on this branch.`)
  }
  const user = existingUser ?? await createUser({
    email: emailAddress,
    password_hash: `${provider}-oauth:${randomUUID()}`,
    name: emailAddress.split('@', 1)[0] || 'Contractor',
    role: 'contractor',
    onboarding_completed: false,
  })
  const mailbox = await getMailboxRow(user.id)
  await updateMailbox(user.id, {
    provider,
    provider_account_id: String(profile.id ?? emailAddress),
    provider_sync_cursor: '',
    access_token: accessToken,
    refresh_token: String(token.refresh_token ?? mailbox.refresh_token),
    token_expires_at: tokenDeadline(Number(token.expires_in ?? 3600)),
    scope: String(token.scope ?? getOAuthSettings(provider).scopes.join(' ')),
    connected_at: nowIso(),
    auth_state: '',
    gmail_history_id: '',
  })
  const senderName = String(
    provider === 'microsoft_365'
      ? (profile.displayName ?? emailAddress.split('@', 1)[0] ?? emailAddress)
      : (emailAddress.includes('@') ? emailAddress.split('@', 1)[0] : emailAddress),
  )
  await updateMailbox(user.id, {
    email_address: emailAddress,
    sender_name: senderName,
  })
  return {
    userId: user.id,
    emailAddress,
    name: user.name,
    role: user.role,
    onboardingCompleted: user.onboarding_completed,
    redirectTo: '/contractor/projects',
  }
}

export async function completeGoogleOAuthCallback(code: string) {
  return completeOAuthCallback('google', code)
}

export async function completeMicrosoftOAuthCallback(code: string) {
  return completeOAuthCallback('microsoft_365', code)
}

// Attach a Google mailbox to an already-authenticated user (does not affect session identity)
export async function attachGoogleMailbox(code: string, userId: string, redirectUri: string): Promise<{ emailAddress: string }> {
  return attachMailbox('google', code, userId, redirectUri)
}

// Attach a Microsoft 365 mailbox to an already-authenticated user (does not affect session identity)
export async function attachMicrosoftMailbox(code: string, userId: string, redirectUri: string): Promise<{ emailAddress: string }> {
  return attachMailbox('microsoft_365', code, userId, redirectUri)
}

async function attachMailbox(provider: MailProvider, code: string, userId: string, redirectUri: string): Promise<{ emailAddress: string }> {
  const token = await exchangeOAuthCode(provider, code, redirectUri)
  const accessToken = String(token.access_token ?? '')
  if (!accessToken) throw new Error(`${providerLabel(provider)} did not return an access token.`)

  const profile = provider === 'microsoft_365'
    ? await fetchMicrosoftProfileWithAccessToken(accessToken)
    : await fetchGoogleProfileWithAccessToken(accessToken)
  const emailAddress = String(
    provider === 'microsoft_365'
      ? (profile.mail ?? profile.userPrincipalName ?? '')
      : (profile.emailAddress ?? ''),
  ).trim().toLowerCase()
  if (!emailAddress) throw new Error(`${providerLabel(provider)} did not return an email address.`)

  const senderName = String(
    provider === 'microsoft_365'
      ? (profile.displayName ?? emailAddress.split('@', 1)[0] ?? emailAddress)
      : (emailAddress.includes('@') ? emailAddress.split('@', 1)[0] : emailAddress),
  )

  const existingMailbox = await getMailboxRow(userId)
  await updateMailbox(userId, {
    provider,
    provider_account_id: String(profile.id ?? emailAddress),
    provider_sync_cursor: '',
    access_token: accessToken,
    refresh_token: String(token.refresh_token ?? existingMailbox.refresh_token),
    token_expires_at: tokenDeadline(Number(token.expires_in ?? 3600)),
    scope: String(token.scope ?? getOAuthSettings(provider).scopes.join(' ')),
    email_address: emailAddress,
    sender_name: senderName,
    connected_at: nowIso(),
    auth_state: '',
    gmail_history_id: '',
  })

  return { emailAddress }
}

export async function disconnectGoogleOAuth(userId: string) {
  await clearMailbox(userId)
}

export async function disconnectMailboxOAuth(userId: string) {
  await clearMailbox(userId)
}

async function assertSendableMailbox(userId: string) {
  const mailbox = await getMailboxRow(userId)
  if (!mailbox.email_address || !mailbox.refresh_token) {
    throw new Error('Connect a mailbox account first.')
  }
  return mailbox
}

export async function sendRFQInvites(userId: string, rfqId: string, baseUrl?: string): Promise<OffPlatformSendSummary> {
  const rfq = await assertContractorOwnsRFQ(userId, rfqId)
  const mailbox = await assertSendableMailbox(userId)
  const provider = mailboxProvider(mailbox)
  const requests = await ensureVendorRequestsForRFQ(userId, rfqId)
  if (requests.length === 0) {
    throw new Error('Add at least one off-platform vendor before sending the RFQ.')
  }
  const contractor = await findUserById(userId)
  const contractorName = contractor?.company_info?.company_name ?? contractor?.name ?? mailbox.sender_name ?? 'General Contractor'
  const senderName = contractor?.name ?? mailbox.sender_name ?? contractorName
  const draft = buildRFQEmailDraft({
    contractorName,
    senderName,
    projectName: rfq.projectName,
    rfqTitle: rfq.title,
    requestType: (rfq.requestType as 'rfq' | 'rfp' | undefined) ?? 'rfq',
    bidDeadline: rfq.bidDeadline,
    savedSubject: rfq.email_subject ?? undefined,
    savedBody: rfq.email_body ?? undefined,
  })
  const attachmentBytes = await buildRFQPdfBytes(rfqId)
  const attachmentName = `${rfq.requestType === 'rfp' ? 'rfp' : 'rfq'}-${rfqId}.pdf`
  const results: OffPlatformSendResult[] = []

  for (const request of requests) {
    if (request.gmail_thread_id) continue
    const magicForm = await createMagicFormLink({
      rfqId,
      vendorRequestId: request.id,
      vendorEmail: request.vendor_email,
      bidDeadline: rfq.bidDeadline ?? undefined,
      baseUrl,
    })
    const templateParams = {
      vendorName: request.vendor_name,
      vendorEmail: request.vendor_email,
    }
    const renderedSubject = renderVendorEmailTemplate(draft.subject, templateParams)
    const renderedBody = renderVendorEmailTemplate(draft.body, templateParams)
    const outboundBody = appendMagicFormLink(renderedBody, magicForm.url)
    const mime = buildMimeMessage({
      fromEmail: mailbox.email_address,
      fromName: mailbox.sender_name || contractorName,
      toEmail: request.vendor_email,
      toName: request.vendor_name,
      subject: renderedSubject,
      body: outboundBody,
      attachmentName,
      attachmentBytes,
    })
    try {
      const response: { id?: string; threadId?: string; internetMessageId?: string } = provider === 'microsoft_365'
        ? await sendMicrosoftMessage(userId, {
          subject: renderedSubject,
          safeBody: mime.safeBody,
          htmlBody: mime.htmlBody,
          toEmail: request.vendor_email,
          toName: request.vendor_name,
          attachmentName,
          attachmentBytes,
          internetMessageId: mime.messageId,
        })
        : await sendGmailMessage(userId, mime.raw)
      const sentAt = nowIso()
      await db.update(rfqVendorRequests)
        .set({
          status: 'sent',
          gmail_thread_id: response.threadId ?? '',
          outbound_message_id: response.id ?? cleanMessageId(mime.messageId),
          last_message_at: sentAt,
          last_message_direction: 'outbound',
          match_basis: 'magic_form',
          updated_at: sentAt,
        })
        .where(eq(rfqVendorRequests.id, request.id))

      await upsertEmailMessage({
        contractorUserId: userId,
        gmailMessageId: response.id ?? cleanMessageId(mime.messageId),
        gmailThreadId: response.threadId ?? '',
        internetMessageId: cleanMessageId(
          provider === 'microsoft_365'
            ? response.internetMessageId
            : mime.messageId,
        ),
        rfqId,
        vendorRequestId: request.id,
        direction: 'outbound',
        matchStatus: 'matched',
        matchConfidence: 0.99,
        matchReason: 'magic_form_link',
        subject: renderedSubject,
        normalizedSubject: normalizeSubject(renderedSubject),
        fromEmail: mailbox.email_address,
        fromName: mailbox.sender_name,
        toParticipants: [{ name: request.vendor_name, email: request.vendor_email }],
        ccParticipants: [],
        snippet: outboundBody.slice(0, 200),
        textBody: outboundBody,
        htmlBody: mime.htmlBody,
        sentAt,
        isUnread: false,
        labels: ['SENT'],
        rawPayload: { localSend: true, provider },
      })

      results.push({
        vendorEmail: request.vendor_email,
        vendorRequestId: request.id,
        threadId: response.threadId ?? '',
        messageId: response.id ?? cleanMessageId(mime.messageId),
        success: true,
      })
    } catch (error) {
      results.push({
        vendorEmail: request.vendor_email,
        vendorRequestId: request.id,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send invite.',
      })
    }
  }

  await updateMailbox(userId, { last_sync_at: nowIso() })
  return {
    provider,
    attemptedCount: results.length,
    sentCount: results.filter((result) => result.success).length,
    failedCount: results.filter((result) => !result.success).length,
    results,
  }
}

export async function sendRFQEmails(userId: string, rfqId: string, baseUrl?: string) {
  await sendRFQInvites(userId, rfqId, baseUrl)
  return getRFQEmailWorkflowSummary(userId, rfqId)
}

export async function sendNegotiationThreadReply(params: {
  userId: string
  rfqId: string
  vendorEmail: string
  vendorName: string
  message: string
  vendorId?: string
  baseUrl?: string
}) {
  const rfq = await assertContractorOwnsRFQ(params.userId, params.rfqId)
  const mailbox = await assertSendableMailbox(params.userId)
  const provider = mailboxProvider(mailbox)
  const contractor = await findUserById(params.userId)
  const contractorName = contractor?.company_info?.company_name ?? contractor?.name ?? mailbox.sender_name ?? 'General Contractor'
  const vendorRequest = await upsertVendorRequest(params.userId, params.rfqId, params.vendorEmail, params.vendorName)
  const latestMessage = (await db
    .select()
    .from(rfqEmailMessages)
    .where(eq(rfqEmailMessages.vendor_request_id, vendorRequest.id))
    .orderBy(desc(rfqEmailMessages.sent_at), desc(rfqEmailMessages.id))
    .limit(1))[0]

  const subject = latestMessage?.subject || `Re: ${buildRFQEmailSubject(rfq.title)}`
  const responseUrl = params.vendorId
    ? `${params.baseUrl ?? ''}/vendor/rfqs/${params.rfqId}`
    : (await createMagicFormLink({
      rfqId: params.rfqId,
      vendorRequestId: vendorRequest.id,
      vendorEmail: params.vendorEmail,
      bidDeadline: rfq.bidDeadline ?? undefined,
      baseUrl: params.baseUrl,
    })).url

  const body = [
    `Hi ${params.vendorName || params.vendorEmail},`,
    '',
    'MESSAGE:',
    params.message.trim(),
    '',
    `Respond: ${responseUrl}`,
    '',
    `Thanks,`,
    contractorName,
  ].join('\n')

  const sentAt = nowIso()
  if (provider === 'microsoft_365' && latestMessage?.gmail_message_id) {
    await sendMicrosoftThreadReply(params.userId, latestMessage.gmail_message_id, body)
    await upsertEmailMessage({
      contractorUserId: params.userId,
      gmailMessageId: `local-negotiation-${randomUUID()}`,
      gmailThreadId: vendorRequest.gmail_thread_id,
      internetMessageId: '',
      rfqId: params.rfqId,
      vendorRequestId: vendorRequest.id,
      direction: 'outbound',
      matchStatus: 'matched',
      matchConfidence: 0.99,
      matchReason: 'negotiation_reply',
      subject,
      normalizedSubject: normalizeSubject(subject),
      fromEmail: mailbox.email_address,
      fromName: mailbox.sender_name || contractorName,
      toParticipants: [{ name: params.vendorName, email: params.vendorEmail }],
      ccParticipants: [],
      snippet: body.slice(0, 200),
      textBody: body,
      htmlBody: renderEmailHtmlBody(body),
      sentAt,
      isUnread: false,
      labels: ['SENT'],
      rawPayload: { localSend: true, provider, negotiation: true },
    })
    await updateVendorRequestAfterMessage(
      vendorRequest.id,
      'outbound',
      vendorRequest.gmail_thread_id,
      sentAt,
      vendorRequest.status === 'draft' ? 'sent' : vendorRequest.status,
      'negotiation_reply',
    )
  } else {
    const mime = buildReplyMimeMessage({
      fromEmail: mailbox.email_address,
      fromName: mailbox.sender_name || contractorName,
      toEmail: params.vendorEmail,
      toName: params.vendorName,
      subject,
      body,
      inReplyTo: latestMessage?.internet_message_id,
      references: latestMessage?.internet_message_id,
    })
    const response: { id?: string; threadId?: string; internetMessageId?: string } = provider === 'microsoft_365'
      ? await sendMicrosoftSimpleMessage(params.userId, {
        subject,
        htmlBody: mime.htmlBody,
        toEmail: params.vendorEmail,
        toName: params.vendorName,
        internetMessageId: mime.messageId,
      })
      : await sendGmailMessage(params.userId, mime.raw, vendorRequest.gmail_thread_id)
    await upsertEmailMessage({
      contractorUserId: params.userId,
      gmailMessageId: response.id ?? cleanMessageId(mime.messageId),
      gmailThreadId: response.threadId ?? vendorRequest.gmail_thread_id,
      internetMessageId: cleanMessageId(provider === 'microsoft_365' ? response.internetMessageId : mime.messageId),
      rfqId: params.rfqId,
      vendorRequestId: vendorRequest.id,
      direction: 'outbound',
      matchStatus: 'matched',
      matchConfidence: 0.99,
      matchReason: 'negotiation_reply',
      subject,
      normalizedSubject: normalizeSubject(subject),
      fromEmail: mailbox.email_address,
      fromName: mailbox.sender_name || contractorName,
      toParticipants: [{ name: params.vendorName, email: params.vendorEmail }],
      ccParticipants: [],
      snippet: body.slice(0, 200),
      textBody: body,
      htmlBody: mime.htmlBody,
      sentAt,
      isUnread: false,
      labels: ['SENT'],
      rawPayload: { localSend: true, provider, negotiation: true },
    })
    await updateVendorRequestAfterMessage(
      vendorRequest.id,
      'outbound',
      response.threadId ?? vendorRequest.gmail_thread_id,
      sentAt,
      vendorRequest.status === 'draft' ? 'sent' : vendorRequest.status,
      'negotiation_reply',
    )
  }

  await updateMailbox(params.userId, { last_sync_at: nowIso() })
}

export async function syncRFQReplies(userId: string, rfqId: string, forceFull = false) {
  await assertContractorOwnsRFQ(userId, rfqId)
  const mailbox = await assertSendableMailbox(userId)
  const provider = mailboxProvider(mailbox)
  if (provider === 'microsoft_365') {
    const messages = await listRecentMicrosoftMessages(userId, forceFull ? '' : mailbox.provider_sync_cursor, RECENT_THREAD_LIMIT)
    let newestCursor = mailbox.provider_sync_cursor
    let syncedThreads = 0
    for (const message of messages) {
      await processMicrosoftMessage(userId, message)
      const receivedAt = String(message.receivedDateTime ?? '')
      if (receivedAt && receivedAt > newestCursor) newestCursor = receivedAt
      syncedThreads += 1
    }
    await updateMailbox(userId, {
      provider_sync_cursor: newestCursor,
      last_sync_at: nowIso(),
    })
    return {
      mode: forceFull ? 'full' : 'incremental',
      syncedThreads,
      summary: getRFQEmailWorkflowSummary(userId, rfqId),
    }
  }
  const profile = await fetchGoogleProfile(userId)
  const currentHistoryId = String(profile.historyId ?? '')
  const trackedIds = await trackedThreadIdsForUser(userId)
  let changedThreadIds: string[]
  let mode: 'full' | 'incremental' = 'incremental'

  if (forceFull || !mailbox.gmail_history_id) {
    changedThreadIds = [...new Set([...trackedIds, ...(await listRecentGmailThreads(userId))])]
    mode = 'full'
  } else {
    try {
      changedThreadIds = await changedThreadIdsFromHistory(userId, mailbox.gmail_history_id)
    } catch (error) {
      if (String(error).toLowerCase().includes('history')) {
        changedThreadIds = await listRecentGmailThreads(userId)
        mode = 'full'
      } else {
        throw error
      }
    }
  }

  if (changedThreadIds.length === 0) {
    changedThreadIds = trackedIds
  }

  let syncedThreads = 0
  for (const threadId of changedThreadIds) {
    const payload = await fetchGmailThread(userId, threadId)
    await processGmailThread(userId, payload)
    syncedThreads += 1
  }

  await updateMailbox(userId, {
    gmail_history_id: currentHistoryId,
    provider_sync_cursor: currentHistoryId,
    last_sync_at: nowIso(),
  })

  return {
    mode,
    syncedThreads,
    summary: getRFQEmailWorkflowSummary(userId, rfqId),
  }
}

export async function syncRFQMailbox(userId: string, rfqId: string, forceFull = false) {
  return syncRFQReplies(userId, rfqId, forceFull)
}
