// @vitest-environment node
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSession, requireIssuerSession, invalidateSession, cookieForToken } from './auth'
import { DEMO_ISSUER_ID, type IssuerEnv } from './config'
import { requireSameOrigin } from './http'
import { onRequestPost as login } from '../api/auth/login'
import { onRequestGet as session } from '../api/auth/session'
import { onRequestPost as logout } from '../api/auth/logout'

const ACCESS_KEY = 'test-access-key-should-never-be-used-in-production'
const ORIGIN = 'https://trueseal-431.pages.dev'
const hash = (s: string) => createHash('sha256').update(s).digest('hex')

type Args = unknown[]
class AuthDb {
  issuerActive = true
  attempts = new Map<string, { window: number; count: number }>()
  sessions = new Map<string, { issuer: string; exp: number }>()
  fail = false
  prepare(sql: string) {
    let args: Args = []
    return {
      bind(...values: Args) { args = values; return this },
      first: async (): Promise<unknown> => {
        if (this.fail) throw Error('SECRET: database details')
        if (sql.includes('INSERT INTO login_attempts')) {
          const [key, now, cutoff] = args as [string, number, number]
          const current = this.attempts.get(key)
          const count = !current || current.window <= cutoff ? 1 : current.count + 1
          this.attempts.set(key, { window: count === 1 ? now : current!.window, count })
          return { attempt_count: count }
        }
        if (sql.includes('SELECT id, display_name, trust_tier FROM issuers')) {
          return this.issuerActive ? { id: DEMO_ISSUER_ID, display_name: 'TrueSeal Demo Organization', trust_tier: 'demo' } : null
        }
        if (sql.includes('FROM admin_sessions s JOIN issuers')) {
          const stored = this.sessions.get(args[0] as string)
          return stored && stored.exp > (args[1] as number) && this.issuerActive
            ? { issuer_id: stored.issuer, expires_at: stored.exp, display_name: 'TrueSeal Demo Organization', trust_tier: 'demo' }
            : null
        }
        throw new Error('Unexpected SQL first: ' + sql)
      },
      run: async () => {
        if (this.fail) throw Error('SECRET: database details')
        if (sql.startsWith('INSERT INTO admin_sessions')) {
          this.sessions.set(args[0] as string, { issuer: args[1] as string, exp: args[3] as number })
          return { success: true }
        }
        if (sql.startsWith('DELETE FROM login_attempts')) { this.attempts.delete(args[0] as string); return { success: true } }
        if (sql.startsWith('DELETE FROM admin_sessions')) { this.sessions.delete(args[0] as string); return { success: true } }
        throw new Error('Unexpected SQL run: ' + sql)
      },
    }
  }
}
function env(db: AuthDb): IssuerEnv {
  return {
    DB: db as unknown as D1Database,
    TRUSEAL_ACCESS_KEY_SHA256: hash(ACCESS_KEY),
    TRUSEAL_THROTTLE_SECRET: 'not-a-production-secret-this-is-only-a-test-0123456789',
  }
}
function req(path: string, method = 'POST', body?: object, origin = ORIGIN, cookie?: string): Request {
  return new Request(ORIGIN + path, {
    method, headers: {
      Origin: origin,
      ...(body && { 'Content-Type': 'application/json' }),
      ...(cookie && { Cookie: cookie }),
    }, body: body ? JSON.stringify(body) : undefined,
  })
}
function ctx<T extends (context: never) => unknown>(_handler: T, request: Request, e: IssuerEnv): Parameters<T>[0] {
  return { request, env: e } as Parameters<T>[0]
}

afterEach(() => vi.useRealTimers())

describe('CP05 secure authentication', () => {
  it('creates a four-hour secure cookie but persists only token hash', async () => {
    const db = new AuthDb()
    const response = await login(ctx(login, req('/api/auth/login', 'POST', { accessKey: ACCESS_KEY }), env(db)))
    expect(response.status).toBe(200)
    const cookie = response.headers.get('set-cookie')!
    expect(cookie).toContain('__Host-trueseal-session=')
    for (const part of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=14400']) expect(cookie).toContain(part)
    const token = cookie.split(';')[0].split('=')[1]
    expect(token).toHaveLength(64)
    expect(db.sessions.has(token)).toBe(false)
    expect(db.sessions.has(hash(token))).toBe(true)
    expect(await (await session(ctx(session, req('/api/auth/session', 'GET', undefined, ORIGIN, cookie), env(db)))).json())
      .toMatchObject({ issuer: { issuerId: DEMO_ISSUER_ID, trustTier: 'demo' } })
  })
  it('creates distinct random sessions on repeated successful sign-ins', async () => {
    const db = new AuthDb(); const e = env(db)
    const a = await createSession(req('/api/auth/login'), e, ACCESS_KEY)
    const b = await createSession(req('/api/auth/login'), e, ACCESS_KEY)
    expect(a.token).not.toBe(b.token)
    expect(db.sessions.size).toBe(2)
  })
  it('rejects wrong access key and then rate limits atomically on shared throttle bucket', async () => {
    const db = new AuthDb()
    for (let i = 0; i < 5; i++) {
      const response = await login(ctx(login, req('/api/auth/login', 'POST', { accessKey: 'wrong' }), env(db)))
      expect(response.status).toBe(401)
    }
    const response = await login(ctx(login, req('/api/auth/login', 'POST', { accessKey: ACCESS_KEY }), env(db)))
    expect(response.status).toBe(429)
  })
  it('allows a new attempt after throttle window expiration', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-08T00:00:00.000Z'))
    const db = new AuthDb()
    for (let i = 0; i < 6; i++) await login(ctx(login, req('/api/auth/login', 'POST', { accessKey: 'wrong' }), env(db)))
    vi.advanceTimersByTime(901_000)
    const response = await login(ctx(login, req('/api/auth/login', 'POST', { accessKey: ACCESS_KEY }), env(db)))
    expect(response.status).toBe(200)
  })
  it('rejects forged, missing and expired cookies', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-08T00:00:00.000Z'))
    const db = new AuthDb()
    const e = env(db)
    expect((await session(ctx(session, req('/api/auth/session', 'GET'), e))).status).toBe(401)
    expect((await session(ctx(session, req('/api/auth/session', 'GET', undefined, ORIGIN, '__Host-trueseal-session=' + '0'.repeat(64)), e))).status).toBe(401)
    const { token } = await createSession(req('/api/auth/login'), e, ACCESS_KEY)
    expect((await session(ctx(session, req('/api/auth/session', 'GET', undefined, ORIGIN, cookieForToken(token)), e))).status).toBe(200)
    vi.advanceTimersByTime(14_401_000)
    expect((await session(ctx(session, req('/api/auth/session', 'GET', undefined, ORIGIN, cookieForToken(token)), e))).status).toBe(401)
  })
  it('logout deletes the server-side session and clears cookie immediately', async () => {
    const db = new AuthDb()
    const e = env(db)
    const { token } = await createSession(req('/api/auth/login'), e, ACCESS_KEY)
    const cookie = cookieForToken(token)
    const response = await logout(ctx(logout, req('/api/auth/logout', 'POST', undefined, ORIGIN, cookie), e))
    expect(response.status).toBe(204)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await session(ctx(session, req('/api/auth/session', 'GET', undefined, ORIGIN, cookie), e))).status).toBe(401)
    expect(db.sessions.size).toBe(0)
  })
  it('denies disabled issuer even with a previously valid session', async () => {
    const db = new AuthDb()
    const e = env(db)
    const { token } = await createSession(req('/api/auth/login'), e, ACCESS_KEY)
    db.issuerActive = false
    await expect(requireIssuerSession(req('/api/auth/session', 'GET', undefined, ORIGIN, cookieForToken(token)), e)).rejects.toMatchObject({ status: 401 })
  })
  it('blocks cross-origin and missing-Origin state changes', async () => {
    const db = new AuthDb()
    const bad = await login(ctx(login, req('/api/auth/login', 'POST', { accessKey: ACCESS_KEY }, 'https://attacker.invalid'), env(db)))
    expect(bad.status).toBe(403)
    expect(db.sessions.size).toBe(0)
    const noOrigin = new Request(ORIGIN + '/api/auth/logout', { method: 'POST' })
    expect(() => requireSameOrigin(noOrigin)).toThrow()
    const site = new Request(ORIGIN + '/api/auth/logout', { method: 'POST', headers: { Origin: ORIGIN, 'Sec-Fetch-Site': 'cross-site' } })
    expect(() => requireSameOrigin(site)).toThrow()
  })
  it('database outages are not accepted as authentication success and do not disclose SQL', async () => {
    const db = new AuthDb(); db.fail = true
    const response = await login(ctx(login, req('/api/auth/login', 'POST', { accessKey: ACCESS_KEY }), env(db)))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('SECRET:')
  })
  it('does not allow raw session cookie to serve as a DB token hash', async () => {
    const db = new AuthDb(); const e = env(db)
    const { token } = await createSession(req('/api/auth/login'), e, ACCESS_KEY)
    expect(db.sessions.has(token)).toBe(false)
    await invalidateSession(req('/api/auth/logout', 'POST', undefined, ORIGIN, cookieForToken(token)), e)
    expect(db.sessions.size).toBe(0)
  })
})
