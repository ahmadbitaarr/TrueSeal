// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { onRequestGet } from './health'

function context(db?: unknown): Parameters<typeof onRequestGet>[0] {
  return { env: db === undefined ? {} : { DB: db } } as Parameters<typeof onRequestGet>[0]
}

describe('GET /api/health', () => {
  it('only reports success after a real read-only D1 query resolves', async () => {
    const first = vi.fn().mockResolvedValue({ healthy: 1 })
    const prepare = vi.fn().mockReturnValue({ first })
    const response = await onRequestGet(context({ prepare }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', application: 'ok', database: 'connected' })
    expect(prepare).toHaveBeenCalledExactlyOnceWith('SELECT 1 AS healthy')
    expect(first).toHaveBeenCalledOnce()
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('returns 503 with no D1 binding', async () => {
    const response = await onRequestGet(context())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'error', application: 'ok', database: 'unavailable' })
  })

  it('returns 503 for invalid or incomplete D1 bindings', async () => {
    const response = await onRequestGet(context({}))
    expect(response.status).toBe(503)
  })

  it('returns 503 for an unexpected D1 query result', async () => {
    const response = await onRequestGet(context({ prepare: () => ({ first: async () => null }) }))
    expect(response.status).toBe(503)
  })

  it('returns 503 without leaking D1 error details', async () => {
    const response = await onRequestGet(context({ prepare: () => { throw new Error('secret SQL connection detail') } }))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('secret SQL connection detail')
  })
})
