/** Small no-cache, no-CORS JSON helpers for private Pages Functions. */
export const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
}

export class HttpProblem extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } })
}

export function problem(error: unknown): Response {
  if (error instanceof HttpProblem) {
    return json({ error: error.code, message: error.message }, error.status,
      error.status === 429 ? { 'retry-after': '900' } : undefined)
  }
  // Do not disclose D1, JOSE, stack traces, environment values or input material.
  return json({ error: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.' }, 503)
}

/** Enforce explicit Origin for every cookie-authenticated state-changing request. */
export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('Origin')
  const fetchSite = request.headers.get('Sec-Fetch-Site')
  let expected: string
  try { expected = new URL(request.url).origin } catch { throw new HttpProblem(403, 'FORBIDDEN', 'Request origin rejected.') }
  if (!origin || origin !== expected || fetchSite === 'cross-site') {
    throw new HttpProblem(403, 'FORBIDDEN', 'Request origin rejected.')
  }
}

export async function readJsonObject(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new HttpProblem(400, 'INVALID_REQUEST', 'JSON body required.')
  }
  const size = Number(request.headers.get('content-length'))
  if (Number.isFinite(size) && size > maxBytes) {
    throw new HttpProblem(400, 'INVALID_REQUEST', 'Request body too large.')
  }
  let body: string
  try { body = await request.text() } catch { throw new HttpProblem(400, 'INVALID_REQUEST', 'Invalid request body.') }
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    throw new HttpProblem(400, 'INVALID_REQUEST', 'Request body too large.')
  }
  try {
    const parsed: unknown = JSON.parse(body)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error()
    return parsed as Record<string, unknown>
  } catch { throw new HttpProblem(400, 'INVALID_REQUEST', 'Invalid JSON body.') }
}

export function requireDatabase(env: { DB?: D1Database }): D1Database {
  if (!env.DB || typeof env.DB.prepare !== 'function') {
    throw new HttpProblem(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable.')
  }
  return env.DB
}
