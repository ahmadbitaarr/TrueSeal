export interface Env {
  DB?: D1Database
}

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
}

function healthResponse(connected: boolean): Response {
  return new Response(JSON.stringify({
    status: connected ? 'ok' : 'error',
    application: 'ok',
    database: connected ? 'connected' : 'unavailable',
  }), { status: connected ? 200 : 503, headers })
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env?.DB || typeof env.DB.prepare !== 'function') {
    return healthResponse(false)
  }

  try {
    const result = await env.DB.prepare('SELECT 1 AS healthy').first<{ healthy: number }>()
    return healthResponse(result?.healthy === 1)
  } catch {
    // Deliberately do not return D1 exception text, SQL diagnostics, or secret values.
    return healthResponse(false)
  }
}
