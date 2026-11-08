// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { exportJWK, generateKeyPair, type JWK } from 'jose'
import { importEd25519PrivateJwk, signQrToken } from './crypto'
import { verifyPublicQr, extractVerificationToken } from './verify'
import { onRequestPost } from '../api/verify'
import { DEMO_ISSUER_ID, DEMO_KID, type IssuerEnv } from './config'
import type { SignedQrClaims } from '../../src/shared/types'

const ORIGIN = 'https://trueseal-431.pages.dev'

class VerifyDb {
  issuerStatus = 'active'
  keyStatus = 'active'
  allowHost = true
  codeMissing = false
  issuerMissing = false
  failRead = false
  revoked: number | null = null
  storedToken = ''
  claims!: SignedQrClaims
  publicJwk!: JWK
  prepare(sql: string) {
    let params: unknown[] = []
    return {
      bind(...values: unknown[]) { params = values; return this },
      first: async () => {
        if (this.failRead) throw new Error('database down')
        if (sql.includes('FROM issuer_keys k JOIN issuers')) {
          if (this.issuerMissing || params[0] !== DEMO_KID || params[1] !== DEMO_ISSUER_ID) return null
          return { issuer_id: DEMO_ISSUER_ID, display_name: 'TrueSeal Demo Organization', trust_tier: 'demo',
            issuer_status: this.issuerStatus, kid: DEMO_KID, key_status: this.keyStatus, public_jwk: JSON.stringify(this.publicJwk) }
        }
        if (sql.includes('FROM codes WHERE')) {
          if (this.codeMissing || params[0] !== this.claims.jti || params[1] !== DEMO_ISSUER_ID || params[2] !== DEMO_KID) return null
          return { jti: this.claims.jti, issuer_id: DEMO_ISSUER_ID, kid: DEMO_KID, title: 'Demo QR',
            destination_url: this.claims.dst, signed_token: this.storedToken, issued_at: this.claims.iat,
            expires_at: this.claims.exp, revoked_at: this.revoked }
        }
        if (sql.includes('FROM issuer_allowed_hosts')) return this.allowHost && params[0] === DEMO_ISSUER_ID && params[1] === 'trueseal-431.pages.dev' ? { hostname: params[1] } : null
        throw new Error('unexpected query')
      },
    }
  }
}

async function fixture(expired = false) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
  const jwk = await exportJWK(publicKey)
  const privateJwk = await exportJWK(privateKey)
  const now = Math.floor(Date.now() / 1000)
  const claims: SignedQrClaims = { iss: DEMO_ISSUER_ID, aud: 'trueseal-qr', jti: crypto.randomUUID(),
    iat: now - (expired ? 1000 : 30), exp: now + (expired ? -100 : 3600),
    dst: ORIGIN + '/demo', v: 1 }
  const key = await importEd25519PrivateJwk(privateJwk)
  const token = await signQrToken(claims, DEMO_KID, key)
  const db = new VerifyDb()
  db.claims = claims
  db.storedToken = token
  db.publicJwk = jwk
  const env: IssuerEnv = { DB: db as unknown as D1Database, TRUSEAL_PUBLIC_ORIGIN: ORIGIN }
  return { db, env, token, claims, key, now }
}

describe('CP07 genuine public verification', () => {
  it('authentic registered token returns VERIFIED with the exact destination and demo identity', async () => {
    const { env, token } = await fixture()
    const actual = await verifyPublicQr(env, `${ORIGIN}/v/${token}`)
    expect(actual).toMatchObject({ status: 'VERIFIED', destination: ORIGIN + '/demo',
      issuer: { id: DEMO_ISSUER_ID, displayName: 'TrueSeal Demo Organization', trustTier: 'demo' } })
  })
  it('a changed signature cannot return VERIFIED', async () => {
    const { env, token } = await fixture()
    const parts = token.split('.')
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1)
    expect((await verifyPublicQr(env, parts.join('.'))).status).toBe('INVALID')
  })
  it('changed issuer-signed destination cannot return VERIFIED', async () => {
    const { env, token } = await fixture()
    const [header, payload, sig] = token.split('.')
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SignedQrClaims
    claims.dst = 'https://attacker.example'
    expect((await verifyPublicQr(env, `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${sig}`)).status).toBe('INVALID')
  })
  it('unsigned arbitrary and cross-origin URLs are UNKNOWN', async () => {
    const { env, token } = await fixture()
    for (const input of ['https://unverified.example/path', 'hello world', `https://evil.example/v/${token}`, 'http://trueseal-431.pages.dev/v/a.b.c', `${ORIGIN}/v/${token}?source=attacker`]) {
      expect((await verifyPublicQr(env, input)).status).toBe('UNKNOWN')
    }
  })
  it('authentic expired token returns EXPIRED rather than INVALID', async () => {
    const { env, token } = await fixture(true)
    expect((await verifyPublicQr(env, token)).status).toBe('EXPIRED')
  })
  it('revocation takes precedence over expiry', async () => {
    const { env, token, db, claims } = await fixture(true)
    db.revoked = claims.iat + 100
    expect((await verifyPublicQr(env, token)).status).toBe('REVOKED')
  })
  it('unknown issuer or key is never trusted', async () => {
    const { env, token, db } = await fixture()
    db.issuerMissing = true
    expect((await verifyPublicQr(env, token)).status).toBe('UNKNOWN')
  })
  it('disabled issuer or signing key is CAUTION, never VERIFIED', async () => {
    const { env, token, db } = await fixture()
    db.issuerStatus = 'disabled'
    expect((await verifyPublicQr(env, token)).status).toBe('CAUTION')
    db.issuerStatus = 'active'
    db.keyStatus = 'disabled'
    expect((await verifyPublicQr(env, token)).status).toBe('CAUTION')
  })
  it('host removed from current policy produces CAUTION', async () => {
    const { env, token, db } = await fixture()
    db.allowHost = false
    expect((await verifyPublicQr(env, token)).status).toBe('CAUTION')
  })
  it('unregistered JTI is UNKNOWN; stored-token mismatch is INVALID', async () => {
    const { env, token, db } = await fixture()
    db.codeMissing = true
    expect((await verifyPublicQr(env, token)).status).toBe('UNKNOWN')
    db.codeMissing = false
    db.storedToken = 'a.b.c'
    expect((await verifyPublicQr(env, token)).status).toBe('INVALID')
  })
  it('a database outage is UNAVAILABLE and never VERIFIED', async () => {
    const { env, token, db } = await fixture()
    db.failRead = true
    expect((await verifyPublicQr(env, token)).status).toBe('UNAVAILABLE')
    delete env.DB
    expect((await verifyPublicQr(env, token)).status).toBe('UNAVAILABLE')
  })
  it('rejects an attacker-chosen header key URL before any key fetch', async () => {
    const { env, token } = await fixture()
    const [header, payload, sig] = token.split('.')
    const decoded = JSON.parse(Buffer.from(header, 'base64url').toString()) as Record<string, string>
    const forged = Buffer.from(JSON.stringify({ ...decoded, jku: 'https://attacker.example/jwks' })).toString('base64url') + '.' + payload + '.' + sig
    expect((await verifyPublicQr(env, forged)).status).toBe('INVALID')
  })
  it('input normalization permits only exact origin or compact token', async () => {
    const { token } = await fixture()
    expect(extractVerificationToken(`${ORIGIN}/v/${token}`, ORIGIN)).toBe(token)
    expect(extractVerificationToken(token, ORIGIN)).toBe(token)
    expect(extractVerificationToken(`${ORIGIN}.evil.test/v/${token}`, ORIGIN)).toBeNull()
    expect(extractVerificationToken(`${ORIGIN}/v/${token}#fragment`, ORIGIN)).toBeNull()
  })
  it('POST /api/verify is no-store and returns 503 for outage', async () => {
    const { env, token, db } = await fixture()
    const req = new Request(`${ORIGIN}/api/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: token }) })
    const verified = await onRequestPost({ request: req, env } as Parameters<typeof onRequestPost>[0])
    expect(verified.status).toBe(200)
    expect(verified.headers.get('cache-control')).toBe('no-store')
    db.failRead = true
    const unavailable = await onRequestPost({ request: new Request(`${ORIGIN}/api/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: token }) }), env } as Parameters<typeof onRequestPost>[0])
    expect(unavailable.status).toBe(503)
    expect((await unavailable.json()) as { status: string }).toMatchObject({ status: 'UNAVAILABLE' })
  })
})
