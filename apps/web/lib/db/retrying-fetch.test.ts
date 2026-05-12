import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRetryingFetch } from './retrying-fetch'

describe('createRetryingFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retries transient Neon fetch failures and returns the eventual response', async () => {
    const response = new Response('ok', { status: 200 })
    const baseFetch = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(response)
    const retryingFetch = createRetryingFetch(baseFetch, {
      attempts: 3,
      timeoutMs: 1000,
      retryDelayMs: () => 0,
    })

    await expect(retryingFetch('https://db.example/sql')).resolves.toBe(response)
    expect(baseFetch).toHaveBeenCalledTimes(2)
  })

  it('retries retryable HTTP responses from Neon before returning success', async () => {
    const baseFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const retryingFetch = createRetryingFetch(baseFetch, {
      attempts: 2,
      timeoutMs: 1000,
      retryDelayMs: () => 0,
    })

    const response = await retryingFetch('https://db.example/sql')
    expect(response.status).toBe(200)
    expect(baseFetch).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-transient caller errors', async () => {
    const baseFetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('bad request body'))
    const retryingFetch = createRetryingFetch(baseFetch, {
      attempts: 3,
      timeoutMs: 1000,
      retryDelayMs: () => 0,
    })

    await expect(retryingFetch('https://db.example/sql')).rejects.toThrow('bad request body')
    expect(baseFetch).toHaveBeenCalledTimes(1)
  })
})
