import { lookup as systemLookup, Resolver } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'

type LookupResult = { address: string; family: 4 | 6 }
type LookupFn = (hostname: string) => Promise<LookupResult>
type Resolve4Fn = (hostname: string) => Promise<string[]>

const OPENAI_HOSTNAME = 'api.openai.com'
const publicResolver = new Resolver()
publicResolver.setServers(['1.1.1.1', '8.8.8.8'])

export async function resolveHostnameWithOpenAIFallback(
  hostname: string,
  lookup: LookupFn = lookupWithSystemResolver,
  resolve4: Resolve4Fn = (name) => publicResolver.resolve4(name),
): Promise<LookupResult> {
  try {
    return await lookup(hostname)
  } catch (error) {
    if (hostname !== OPENAI_HOSTNAME || !isDnsResolutionError(error)) throw error
    const addresses = await resolve4(hostname)
    const address = addresses[0]
    if (!address) throw error
    return { address, family: 4 }
  }
}

export function createOpenAIResilientFetch(nativeFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (url.hostname !== OPENAI_HOSTNAME) return nativeFetch(input, init)
    return fetchWithOpenAIFallbackLookup(url, init)
  }
}

async function lookupWithSystemResolver(hostname: string): Promise<LookupResult> {
  const result = await systemLookup(hostname)
  return { address: result.address, family: result.family as 4 | 6 }
}

function isDnsResolutionError(error: unknown) {
  return error instanceof Error && /ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(`${(error as NodeJS.ErrnoException).code ?? ''} ${error.message}`)
}

function fetchWithOpenAIFallbackLookup(url: URL, init: RequestInit | undefined): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers = new Headers(init?.headers)
    const req = httpsRequest({
      protocol: url.protocol,
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(headers.entries()),
      signal: init?.signal ?? undefined,
      lookup(hostname, options, callback) {
        resolveHostnameWithOpenAIFallback(String(hostname))
          .then((result) => {
            if (typeof options === 'object' && options?.all) {
              callback(null, [result])
            } else {
              callback(null, result.address, result.family)
            }
          })
          .catch((error) => callback(error as NodeJS.ErrnoException, '', 4))
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on('end', () => {
        resolve(new Response(Buffer.concat(chunks), {
          status: res.statusCode ?? 0,
          statusText: res.statusMessage,
          headers: responseHeaders(res.headers),
        }))
      })
    })

    req.on('error', reject)
    writeRequestBody(req, init?.body).then(() => req.end()).catch((error) => {
      req.destroy(error)
      reject(error)
    })
  })
}

async function writeRequestBody(req: ReturnType<typeof httpsRequest>, body: RequestInit['body'] | null | undefined) {
  if (body == null) return
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    req.write(body)
    return
  }
  if (body instanceof ArrayBuffer) {
    req.write(Buffer.from(body))
    return
  }
  if (ArrayBuffer.isView(body)) {
    req.write(Buffer.from(body.buffer, body.byteOffset, body.byteLength))
    return
  }
  if (body instanceof URLSearchParams) {
    req.write(body.toString())
    return
  }
  throw new Error('OpenAI resilient fetch does not support streaming request bodies yet.')
}

function responseHeaders(headers: Record<string, number | string | string[] | undefined>) {
  const result = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item)
    } else {
      result.set(key, String(value))
    }
  }
  return result
}
