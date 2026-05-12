import { afterEach, describe, expect, it } from 'vitest'
import { buildServer } from './server.js'
import type { ProductAgentRuntime } from './agent/core.js'

const originalApiKey = process.env.OPENAI_API_KEY

afterEach(() => {
  if (originalApiKey == null) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = originalApiKey
})

describe('/agent/turn', () => {
  it('requires the Product Agent Runtime to be configured', async () => {
    delete process.env.OPENAI_API_KEY
    const app = buildServer()

    const response = await app.inject({
      method: 'POST',
      url: '/agent/turn',
      payload: {
        user: {
          id: 'user-1',
          contractorOrganizationId: 'org-1',
          role: 'estimator',
          name: 'Estimator One',
          email: 'estimator@example.com',
        },
        messages: [{ role: 'user', content: 'highlight missing lead times' }],
        currentPage: { path: '/contractor/quote-comparison', title: 'Quote Comparison' },
      },
    })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({
      status: 'blocked',
      error: 'Rialto Agent requires OPENAI_API_KEY.',
    })
  })

  it('returns the Product Agent Runtime response when configured', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const runtime: ProductAgentRuntime = {
      async runTurn() {
        return {
          status: 'completed',
          reply: 'Ready for review.',
          toolResults: [{
            callId: 'call-1',
            toolId: 'quoteComparison.proposeHighlights',
            status: 'ok',
            summary: 'Prepared highlights.',
            data: {
              action: 'comparison-patch-fragment',
              fragment: {
                summary: 'Highlight missing lead times.',
                operations: [{
                  kind: 'add-highlight',
                  id: 'hl-1',
                  selector: { kind: 'cell', rowKey: 'line-1', colKey: 'lead' },
                  color: 'red',
                }],
              },
            },
          }],
        }
      },
    }
    const app = buildServer({ runtime })

    const response = await app.inject({
      method: 'POST',
      url: '/agent/turn',
      payload: {
        user: {
          id: 'user-1',
          contractorOrganizationId: 'org-1',
          role: 'estimator',
          name: 'Estimator One',
          email: 'estimator@example.com',
        },
        messages: [{ role: 'user', content: 'highlight missing lead times' }],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: 'completed',
      reply: 'Ready for review.',
      proposal: {
        kind: 'comparison-patch-proposal',
        operations: [{ kind: 'add-highlight', id: 'hl-1' }],
      },
    })
  })

  it('streams progress events before the final Product Agent Runtime response', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const runtime: ProductAgentRuntime = {
      async runTurn(request) {
        request.onProgress?.({ type: 'tool_result', toolId: 'quoteComparison.inspectSnapshot', status: 'ok', message: 'Inspected sheet.' })
        return {
          status: 'completed',
          reply: 'Ready for review.',
          toolResults: [{
            callId: 'call-1',
            toolId: 'quoteComparison.inspectSnapshot',
            status: 'ok',
            summary: 'Inspected sheet.',
          }],
        }
      },
    }
    const app = buildServer({ runtime })

    const response = await app.inject({
      method: 'POST',
      url: '/agent/turn/stream',
      payload: {
        user: {
          id: 'user-1',
          contractorOrganizationId: 'org-1',
          role: 'estimator',
          name: 'Estimator One',
          email: 'estimator@example.com',
        },
        messages: [{ role: 'user', content: 'compare quotes' }],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/event-stream')
    const body = response.body
    expect(body.indexOf('event: progress')).toBeLessThan(body.indexOf('event: final'))
    expect(body).toContain('data: {"type":"tool_result","toolId":"quoteComparison.inspectSnapshot","status":"ok","message":"Inspected sheet."}')
    expect(body).toContain('event: final')
    expect(body).toContain('"status":"completed"')
  })

  it('passes the Comparison Sheet Snapshot and debug flag to the Product Agent Runtime', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const seen: unknown[] = []
    const runtime: ProductAgentRuntime = {
      async runTurn(request) {
        seen.push(request)
        return { status: 'completed', reply: 'Done.' }
      },
    }
    const app = buildServer({ runtime })

    await app.inject({
      method: 'POST',
      url: '/agent/turn',
      payload: {
        user: {
          id: 'user-1',
          contractorOrganizationId: 'org-1',
          role: 'estimator',
          name: 'Estimator One',
          email: 'estimator@example.com',
        },
        debug: true,
        messages: [{ role: 'user', content: 'highlight missing lead times' }],
        quoteComparison: {
          snapshot: {
            sheetId: 'sheet-1',
            columns: [{ key: 'lead', label: 'Lead Time' }],
            rows: [{ id: 'line-1', description: 'Door hardware', values: { lead: '' } }],
          },
        },
      },
    })

    expect(seen[0]).toMatchObject({
      debug: true,
      requestContext: {
        quoteComparison: {
          snapshot: {
            sheetId: 'sheet-1',
            rows: [{ id: 'line-1' }],
          },
        },
      },
    })
  })

  it('returns a structured tool error when the Product Agent Runtime throws', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const runtime: ProductAgentRuntime = {
      async runTurn() {
        throw new Error('Connection error.: fetch failed: getaddrinfo ENOTFOUND api.openai.com')
      },
    }
    const app = buildServer({ runtime })

    const response = await app.inject({
      method: 'POST',
      url: '/agent/turn',
      payload: {
        user: {
          id: 'user-1',
          contractorOrganizationId: 'org-1',
          role: 'estimator',
          name: 'Estimator One',
          email: 'estimator@example.com',
        },
        messages: [{ role: 'user', content: 'delete that qty hlf coumn' }],
        currentPage: { path: '/contractor/quote-comparison', title: 'Quote Comparison' },
      },
    })

    expect(response.statusCode).toBe(502)
    expect(response.json()).toMatchObject({
      status: 'tool_error',
      error: 'Rialto Agent could not reach the OpenAI model API. Check network/DNS and retry.',
    })
  })
})

describe('/comparison/propose-patch', () => {
  it('is retired in favor of /agent/turn', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const app = buildServer()

    const response = await app.inject({
      method: 'POST',
      url: '/comparison/propose-patch',
      payload: {
        message: 'hide empty columns',
        sheetSchema: { columns: [], lineItems: [], vendors: [] },
      },
    })

    expect(response.statusCode).toBe(410)
    expect(response.json()).toMatchObject({
      status: 'blocked',
      error: 'Use /agent/turn for Quote Comparison proposals.',
    })
  })
})
