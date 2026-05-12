export interface PostAgentTurnOptions {
  apiUrl?: string
  attempts?: number
  timeoutMs?: number
  retryDelayMs?: (attempt: number) => number
}

export async function postAgentTurnWithRetry(payload: unknown, options: PostAgentTurnOptions = {}) {
  const apiUrl = options.apiUrl ?? process.env.RIALTO_AGENT_API_URL ?? 'http://localhost:8787'
  const attempts = options.attempts ?? 3
  const timeoutMs = options.timeoutMs ?? 45_000
  const retryDelayMs = options.retryDelayMs ?? ((attempt) => 350 * attempt)
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(`${apiUrl}/agent/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      await sleep(retryDelayMs(attempt))
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error(agentFetchErrorMessage(lastError))
}

export function agentTurnFailureMessage(status: number, error?: string) {
  if (status >= 500 && (!error || /^internal server error$/i.test(error.trim()))) {
    return 'Rialto Agent hit a backend or model connectivity error while preparing the Quote Comparison proposal.'
  }
  return error?.trim() || 'Rialto Agent could not prepare a Quote Comparison proposal.'
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function agentFetchErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'Rialto Agent timed out while preparing the Quote Comparison proposal.'
  }
  return 'Rialto Agent backend was temporarily unreachable while preparing the Quote Comparison proposal.'
}
