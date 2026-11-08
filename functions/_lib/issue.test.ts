// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { exportJWK, generateKeyPair, type JWK } from 'jose'
import { importEd25519PublicJwk, verifyQrToken } from './crypto'
import { DEMO_ISSUER_ID, DEMO_KID, type IssuerEnv } from './config'
import { issueCode, type CodeView } from './issue'
import { generateQRCode } from '../../src/lib/qr'
import { PNG } from 'pngjs'
import jsQR from 'jsqr'
import { Buffer } from 'node:buffer'
import { onRequestPost as issueRoute } from '../api/issuer/codes/index'

const ORIGIN = 'https://trueseal-431.pages.dev'
const issuer = { issuerId: DEMO_ISSUER_ID, displayName: 'TrueSeal Demo Organization', trustTier: 'demo', expiresAt: 2000000000 }

class IssueDb {
  active = true
  keyActive = true
  allowHost = true
  failWrite = false
  wrongKey = false
  stored: CodeView[] = []
  publicJwk: JWK = {}
  prepare(sql: string) {
    let args: unknown[] = []
    return {
      bind(...params: unknown[]) { args = params; return this },
      first: async () => {
        if (sql.includes('SELECT k.kid, k.public_jwk FROM issuer_keys')) {
          return this.active && this.keyActive && this.allowHost && args[0] === DEMO_ISSUER_ID && args[1] === DEMO_KID && args[2] === 'trueseal-431.pages.dev'
            ? { kid: DEMO_KID, public_jwk: JSON.stringify(this.publicJwk) }
            : null
        }
        if (sql.includes('INSERT INTO codes')) {
          if (this.failWrite) throw new Error('SECRET database failure')
          if (!this.active || !this.keyActive || !this.allowHost) return null
          this.stored.push({
            jti: args[0] as string, issuerId: args[6] as string, kid: args[7] as string,
            title: args[1] as string, destinationUrl: args[2] as string, signedToken: args[3] as string,
            verificationUrl: ORIGIN + '/v/' + args[3], issuedAt: args[4] as number, expiresAt: args[5] as number,
          })
          return { jti: args[0] }
        }
        throw new Error('Unknown query ' + sql)
      },
    }
  }
}
async function fixture() {
  const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
  const privateJwk = await exportJWK(pair.privateKey)
  const publicJwk = await exportJWK(pair.publicKey)
  const db = new IssueDb()
  db.publicJwk = publicJwk
  const env: IssuerEnv = {
    DB: db as unknown as D1Database,
    TRUSEAL_SIGNING_KID: DEMO_KID,
    TRUSEAL_SIGNING_PRIVATE_JWK: JSON.stringify(privateJwk),
    TRUSEAL_PUBLIC_ORIGIN: ORIGIN,
  }
  return { db, env, publicJwk }
}
const validBody = { title: 'Hackathon demo', destinationUrl: ORIGIN + '/demo', expirationDays: 7 }

describe('CP06 signed issuance and persistence', () => {
  it('authentic Ed25519 signature matches registered key, claims and stored record', async () => {
    const { db, env, publicJwk } = await fixture()
    const result = await issueCode(env, issuer, validBody)
    expect(db.stored).toHaveLength(1)
    expect(db.stored[0].signedToken).toBe(result.signedToken)
    expect(result.verificationUrl).toBe(ORIGIN + '/v/' + result.signedToken)
    expect(result.signedToken.split('.')).toHaveLength(3)
    expect(result.signedToken.length).toBeLessThanOrEqual(2048)
    const publicKey = await importEd25519PublicJwk(publicJwk)
    const authenticated = await verifyQrToken(result.signedToken, publicKey)
    expect(authenticated.protectedHeader).toEqual({ alg: 'EdDSA', typ: 'trueseal+jwt', kid: DEMO_KID })
    expect(authenticated.claims).toMatchObject({ iss: DEMO_ISSUER_ID, aud: 'trueseal-qr', jti: result.jti, dst: validBody.destinationUrl, v: 1 })
    expect(authenticated.claims.exp - authenticated.claims.iat).toBe(7 * 86400)
  })
  it('generated QR PNG decodes exact real signed verification URL', async () => {
    const { env } = await fixture()
    const code = await issueCode(env, issuer, validBody)
    const dataUrl = await generateQRCode(code.verificationUrl)
    const pixels = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'))
    const scan = jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)
    expect(pixels.width).toBeGreaterThanOrEqual(512)
    expect(scan?.data).toBe(code.verificationUrl)
  })
  it.each([
    ['wrong allowed host', { ...validBody, destinationUrl: 'https://trueseal-431.pages.dev.attacker.test/' }],
    ['HTTP', { ...validBody, destinationUrl: 'http://trueseal-431.pages.dev' }],
    ['bad title', { ...validBody, title: 'z'.repeat(65) }],
    ['bad preset', { ...validBody, expirationDays: 31 }],
    ['impersonation id', { ...validBody, issuerId: 'another-issuer' }],
    ['impersonation key', { ...validBody, kid: 'another-key' }],
  ])('rejects %s without persisting', async (_label, body) => {
    const { env, db } = await fixture()
    await expect(issueCode(env, issuer, body)).rejects.toBeDefined()
    expect(db.stored).toHaveLength(0)
  })
  it('rejects host not in allowlist (not just host policy parser)', async () => {
    const { db, env } = await fixture()
    db.allowHost = false
    await expect(issueCode(env, issuer, validBody)).rejects.toMatchObject({ status: 403 })
  })
  it.each(['active', 'key', 'write', 'mismatch'] as const)('fails closed on disabled issuer, disabled key, failed DB insert, or mismatched registry key: %s', async (mode) => {
    const { db, env } = await fixture()
    if (mode === 'active') db.active = false
    if (mode === 'key') db.keyActive = false
    if (mode === 'write') db.failWrite = true
    if (mode === 'mismatch') {
      const other = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
      db.publicJwk = await exportJWK(other.publicKey)
    }
    await expect(issueCode(env, issuer, validBody)).rejects.toBeDefined()
    expect(db.stored).toHaveLength(0)
  })
  it('never trusts a browser-provided issuer', async () => {
    const { env } = await fixture()
    await expect(issueCode(env, { ...issuer, issuerId: 'forged' }, validBody)).rejects.toMatchObject({ status: 403 })
  })
  it('rejects cross-origin issuance before touching the issuer database', async () => {
    const { db, env } = await fixture()
    const request = new Request(ORIGIN + '/api/issuer/codes', {
      method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    const response = await issueRoute({ request, env } as Parameters<typeof issueRoute>[0])
    expect(response.status).toBe(403)
    expect(db.stored).toHaveLength(0)
  })
  it('does not allow unauthenticated issuance through POST route', async () => {
    const { db, env } = await fixture()
    const request = new Request(ORIGIN + '/api/issuer/codes', {
      method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(validBody),
    })
    const response = await issueRoute({ request, env } as Parameters<typeof issueRoute>[0])
    expect(response.status).toBe(401)
    expect(db.stored).toHaveLength(0)
  })
  it('refuses missing production key or origin configuration', async () => {
    const { env, db } = await fixture()
    delete env.TRUSEAL_SIGNING_PRIVATE_JWK
    await expect(issueCode(env, issuer, validBody)).rejects.toBeDefined()
    delete env.TRUSEAL_PUBLIC_ORIGIN
    await expect(issueCode(env, issuer, validBody)).rejects.toBeDefined()
    expect(db.stored).toHaveLength(0)
  })
})
