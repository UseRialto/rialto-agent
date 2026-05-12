export interface RetryingFetchOptions {
  attempts?: number
  timeoutMs?: number
  retryDelayMs?: (attempt: number) => number
}

export function createRetryingFetch(
  baseFetch: typeof fetch = fetch,
  options: RetryingFetchOptions = {},
): typeof fetch {
  const attempts = options.attempts ?? Number(process.env.NEON_FETCH_RETRY_ATTEMPTS ?? 3)
  const timeoutMs = options.timeoutMs ?? Number(process.env.NEON_FETCH_TIMEOUT_MS ?? 15_000)
  const retryDelayMs = options.retryDelayMs ?? ((attempt) => 150 * attempt)

  return async (input, init) => {
    let lastError: unknown
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await baseFetch(input, {
          ...init,
          signal: mergedSignal(init?.signal, controller.signal),
        })
        if (shouldRetryResponse(response) && attempt < attempts) {
          await sleep(retryDelayMs(attempt))
          continue
        }
        return response
      } catch (error) {
        lastError = error
        if (!isRetryableFetchError(error) || attempt === attempts) throw error
        await sleep(retryDelayMs(attempt))
      } finally {
        clearTimeout(timeout)
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Database fetch failed.')
  }
}

function shouldRetryResponse(response: Response) {
  return response.status === 408 || response.status === 429 || response.status >= 500
}

function isRetryableFetchError(error: unknown) {
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' ||
    error.message.toLowerCase().includes('fetch failed') ||
    error.message.toLowerCase().includes('network') ||
    error.message.toLowerCase().includes('timeout')
}

function mergedSignal(original: AbortSignal | null | undefined, timeoutSignal: AbortSignal) {
  if (!original) return timeoutSignal
  if (original.aborted) return original
  const controller = new AbortController()
  const abort = () => controller.abort()
  original.addEventListener('abort', abort, { once: true })
  timeoutSignal.addEventListener('abort', abort, { once: true })
  return controller.signal
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
