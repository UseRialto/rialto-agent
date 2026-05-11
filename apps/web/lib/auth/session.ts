/**
 * JWT session management.
 * - encrypt/decrypt: pure jose functions, Edge Runtime compatible (used in proxy.ts)
 * - createSession/getSession/deleteSession: use next/headers cookies (RSC + server actions only)
 */

import { SignJWT, jwtVerify } from 'jose'
import { cache } from 'react'
import type { SessionPayload } from './types'

const COOKIE_NAME = 'insiteai_session'
const SESSION_DURATION = 60 * 60 * 24 * 7 // 7 days in seconds

function getEncodedKey(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret-insiteai')
}

// Edge-compatible - no next/headers
export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(getEncodedKey())
}

// Edge-compatible - no next/headers
export async function decrypt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getEncodedKey(), { algorithms: ['HS256'] })
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

const decryptCached = cache(decrypt)

// --- Cookie helpers (next/headers - RSC / server actions only, NOT proxy.ts) ---

export async function createSession(user: Pick<SessionPayload, 'userId' | 'role' | 'name' | 'email' | 'onboarding_completed'>): Promise<void> {
  const { cookies } = await import('next/headers')
  const token = await encrypt(user)
  const jar = await cookies()
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  })
}

export async function getSession(): Promise<SessionPayload | null> {
  const { cookies } = await import('next/headers')
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  return decryptCached(token)
}

export async function deleteSession(): Promise<void> {
  const { cookies } = await import('next/headers')
  const jar = await cookies()
  jar.delete(COOKIE_NAME)
}
