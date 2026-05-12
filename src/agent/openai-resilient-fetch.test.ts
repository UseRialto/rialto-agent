import { describe, expect, it } from 'vitest'
import { resolveHostnameWithOpenAIFallback } from './openai-resilient-fetch.js'

describe('OpenAI resilient fetch DNS lookup', () => {
  it('falls back to public DNS when the system resolver cannot resolve api.openai.com', async () => {
    const address = await resolveHostnameWithOpenAIFallback(
      'api.openai.com',
      async () => {
        const error = new Error('getaddrinfo ENOTFOUND api.openai.com') as NodeJS.ErrnoException
        error.code = 'ENOTFOUND'
        throw error
      },
      async () => ['162.159.140.245'],
    )

    expect(address).toEqual({ address: '162.159.140.245', family: 4 })
  })

  it('uses normal system lookup for non-OpenAI hosts', async () => {
    const address = await resolveHostnameWithOpenAIFallback(
      'localhost',
      async () => ({ address: '127.0.0.1', family: 4 }),
      async () => {
        throw new Error('public DNS should not be used')
      },
    )

    expect(address).toEqual({ address: '127.0.0.1', family: 4 })
  })
})
