import { COOKIE_NAME, DEMO_ISSUER_ID, LOGIN_WINDOW_SECONDS, MAX_LOGIN_ATTEMPTS, SESSION_SECONDS, type IssuerEnv } from './config'
import { HttpProblem, requireDatabase } from './http'

export interface IssuerSession {
  issuerId: string
  displayName: string
  trustTier: string
  expiresAt: number
}

function nowSeconds(): number { return Math.floor(Date.now() / 1000) }

async function sha256(data: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return Array.from(new Uint8Array(bytes), (x) => x.toString(16).padStart(2, '0')).join('')
}

function constantTimeHexEquals(expected: string, candidate: string): boolean {
  if (!/^[a-f\d]{64}$/.test(expected) || !/^[a-f\d]{64}$/.test(candidate)) return false
  let mismatch = 0
  for (let i = 0; i < 64; i++) mismatch |= expected.charCodeAt(i) ^ candidate.charCodeAt(i)
  return mismatch === 0
}

function secureRandomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function cookieForToken(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; Secure; HttpOnly; SameSite=Strict`
}

export function expiredCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`
}

function extractSessionToken(request: Request): string | null {
  const raw = request.headers.get('cookie') ?? ''
  const candidates = raw.split(';').map((item) => item.trim())
    .filter((item) => item.startsWith(`${COOKIE_NAME}=`))
  if (candidates.length !== 1) return null
  const token = candidates[0].slice(COOKIE_NAME.length + 1)
  return /^[a-f0-9]{64}$/.test(token) ? token : null
}

async function throttleKey(request: Request, env: IssuerEnv): Promise<string> {
  const secret = env.TRUSEAL_THROTTLE_SECRET
  if (!secret || secret.length < 32) throw new Error('Throttling secret missing')
  // No raw IP is persisted; CF-Connecting-IP is set by Cloudflare on remote requests.
  // Missing IP maps to a conservative shared bucket rather than bypassing limits.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown-client'
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`trueseal-auth:${ip}`))
  return Array.from(new Uint8Array(signature), (x) => x.toString(16).padStart(2, '0')).join('')
}

/** Atomic SQLite UPSERT prevents simultaneous login attempts bypassing a single counter. */
async function reserveLoginAttempt(env: IssuerEnv, key: string, now: number): Promise<number> {
  const db = requireDatabase(env)
  const cutoff = now - LOGIN_WINDOW_SECONDS
  const row = await db.prepare(`
    INSERT INTO login_attempts (throttle_key, window_start, attempt_count)
    VALUES (?, ?, 1)
    ON CONFLICT(throttle_key) DO UPDATE SET
      window_start = CASE WHEN login_attempts.window_start <= ? THEN excluded.window_start ELSE login_attempts.window_start END,
      attempt_count = CASE WHEN login_attempts.window_start <= ? THEN 1 ELSE login_attempts.attempt_count + 1 END
    RETURNING attempt_count
  `).bind(key, now, cutoff, cutoff).first<{ attempt_count: number }>()
  if (!row || !Number.isSafeInteger(row.attempt_count)) throw new Error('Login counter unavailable')
  return row.attempt_count
}

export async function createSession(request: Request, env: IssuerEnv, accessKey: unknown): Promise<{ token: string; issuer: IssuerSession }> {
  if (typeof accessKey !== 'string' || accessKey.length > 256 || !accessKey) {
    throw new HttpProblem(400, 'INVALID_REQUEST', 'Access key required.')
  }
  const db = requireDatabase(env)
  // Misconfigured secrets fail closed before authentication or database writes.
  const verifier = env.TRUSEAL_ACCESS_KEY_SHA256
  if (!verifier || !/^[a-f\d]{64}$/.test(verifier)) throw new Error('Access key verifier missing')
  const key = await throttleKey(request, env)
  const now = nowSeconds()
  const count = await reserveLoginAttempt(env, key, now)
  if (count > MAX_LOGIN_ATTEMPTS) {
    throw new HttpProblem(429, 'RATE_LIMITED', 'Too many login attempts. Try again later.')
  }
  const candidate = await sha256(accessKey)
  if (!constantTimeHexEquals(verifier, candidate)) {
    throw new HttpProblem(401, 'INVALID_CREDENTIALS', 'Invalid access key.')
  }
  const issuer = await db.prepare(`SELECT id, display_name, trust_tier FROM issuers WHERE id = ? AND status = 'active'`)
    .bind(DEMO_ISSUER_ID).first<{ id: string; display_name: string; trust_tier: string }>()
  if (!issuer) throw new HttpProblem(401, 'INVALID_CREDENTIALS', 'Invalid access key.')

  const token = secureRandomToken()
  const expiresAt = now + SESSION_SECONDS
  const insert = await db.prepare('INSERT INTO admin_sessions (token_hash, issuer_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), issuer.id, now, expiresAt).run()
  if (!insert.success) throw new Error('Session storage unavailable')
  // Clear the current bucket only after the session is durably persisted.
  // If deletion fails, fail closed rather than returning an unusable session.
  const reset = await db.prepare('DELETE FROM login_attempts WHERE throttle_key = ?').bind(key).run()
  if (!reset.success) throw new Error('Login counter reset unavailable')
  return { token, issuer: { issuerId: issuer.id, displayName: issuer.display_name, trustTier: issuer.trust_tier, expiresAt } }
}

export async function requireIssuerSession(request: Request, env: IssuerEnv): Promise<IssuerSession> {
  const token = extractSessionToken(request)
  if (!token) throw new HttpProblem(401, 'UNAUTHENTICATED', 'Issuer sign-in required.')
  const db = requireDatabase(env)
  const row = await db.prepare(`
    SELECT s.issuer_id, s.expires_at, i.display_name, i.trust_tier
    FROM admin_sessions s JOIN issuers i ON i.id = s.issuer_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND i.status = 'active'
  `).bind(await sha256(token), nowSeconds()).first<{
    issuer_id: string; expires_at: number; display_name: string; trust_tier: string
  }>()
  if (!row) throw new HttpProblem(401, 'UNAUTHENTICATED', 'Issuer sign-in required.')
  return { issuerId: row.issuer_id, displayName: row.display_name, trustTier: row.trust_tier, expiresAt: row.expires_at }
}

export async function invalidateSession(request: Request, env: IssuerEnv): Promise<void> {
  const token = extractSessionToken(request)
  const db = requireDatabase(env)
  if (!token) return
  const result = await db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?')
    .bind(await sha256(token)).run()
  if (!result.success) throw new Error('Session revocation unavailable')
}
