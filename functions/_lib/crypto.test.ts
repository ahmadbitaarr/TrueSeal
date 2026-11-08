// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { base64url, CompactSign, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose'
import type { SignedQrClaims } from '../../src/shared/types'
import {
  importEd25519PrivateJwk,
  importEd25519PublicJwk,
  isQrExpired,
  signQrToken,
  validateSignedQrClaims,
  verifyQrToken,
} from './crypto'

const KID = 'issuer-1:key-2026-01'

function claims(overrides: Partial<SignedQrClaims> = {}): SignedQrClaims {
  return {
    iss: 'demo-issuer',
    aud: 'trueseal-qr',
    jti: 'qr-000001',
    iat: 1_700_000_000,
    exp: 1_800_000_000,
    dst: 'https://example.edu/events?ticket=abc#entrance',
    v: 1,
    ...overrides,
  }
}

function replacePayload(token: string, changes: Record<string, unknown>): string {
  const [header, body, signature] = token.split('.')
  const decoded = JSON.parse(new TextDecoder().decode(base64url.decode(body))) as Record<string, unknown>
  return `${header}.${base64url.encode(JSON.stringify({ ...decoded, ...changes }))}.${signature}`
}

describe('TrueSeal CP02 Ed25519 compact JWT', () => {
  let signingKey: CryptoKey
  let trustedPublicKey: CryptoKey
  let unrelatedPublicKey: CryptoKey
  let privateJwk: JWK
  let publicJwk: JWK

  beforeAll(async () => {
    // Only ephemeral, in-memory test keys. Never commit exported private material.
    const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
    const unrelated = await generateKeyPair('EdDSA', { crv: 'Ed25519' })
    privateJwk = await exportJWK(pair.privateKey)
    publicJwk = await exportJWK(pair.publicKey)
    signingKey = await importEd25519PrivateJwk(privateJwk)
    trustedPublicKey = await importEd25519PublicJwk(publicJwk)
    unrelatedPublicKey = unrelated.publicKey
  })

  it('signs and verifies correct claims and the exact protected header', async () => {
    const signed = await signQrToken(claims(), KID, signingKey)
    expect(signed.split('.')).toHaveLength(3)
    const result = await verifyQrToken(signed, trustedPublicKey)
    expect(result.claims).toEqual(claims())
    expect(result.protectedHeader).toEqual({ alg: 'EdDSA', typ: 'trueseal+jwt', kid: KID })
  })

  it('rejects a different but valid Ed25519 public key', async () => {
    const signed = await signQrToken(claims(), KID, signingKey)
    await expect(verifyQrToken(signed, unrelatedPublicKey)).rejects.toThrow('Invalid signed QR token')
  })

  it('rejects destination tampering without resigning', async () => {
    const signed = await signQrToken(claims(), KID, signingKey)
    await expect(verifyQrToken(replacePayload(signed, { dst: 'https://attacker.invalid/' }), trustedPublicKey))
      .rejects.toThrow('Invalid signed QR token')
  })

  it('rejects issuer tampering without resigning', async () => {
    const signed = await signQrToken(claims(), KID, signingKey)
    await expect(verifyQrToken(replacePayload(signed, { iss: 'fake-issuer' }), trustedPublicKey))
      .rejects.toThrow('Invalid signed QR token')
  })

  it('rejects even a one-character change to the signature', async () => {
    const signed = await signQrToken(claims(), KID, signingKey)
    const [header, body, signature] = signed.split('.')
    const changed = signature[0] === 'A' ? 'B' : 'A'
    await expect(verifyQrToken(`${header}.${body}.${changed}${signature.slice(1)}`, trustedPublicKey))
      .rejects.toThrow('Invalid signed QR token')
  })

  it('rejects unsigned tokens and alg:none', async () => {
    const header = base64url.encode(JSON.stringify({ alg: 'none', typ: 'trueseal+jwt', kid: KID }))
    const body = base64url.encode(JSON.stringify(claims()))
    await expect(verifyQrToken(`${header}.${body}.`, trustedPublicKey)).rejects.toThrow()
  })

  it('rejects unexpected HS256 algorithm even when that JWS has a valid MAC', async () => {
    const payload = new TextEncoder().encode(JSON.stringify(claims()))
    const hmacKey = new Uint8Array(32).fill(42)
    const signed = await new CompactSign(payload)
      .setProtectedHeader({ alg: 'HS256', typ: 'trueseal+jwt', kid: KID })
      .sign(hmacKey)
    await expect(verifyQrToken(signed, trustedPublicKey)).rejects.toThrow()
  })

  it('rejects malformed compact JWS forms', async () => {
    for (const malformed of ['', 'a.b', 'a.b.c.d', 'not.a.jwt', '.payload.signature']) {
      await expect(verifyQrToken(malformed, trustedPublicKey)).rejects.toThrow()
    }
  })

  it('rejects a valid signature if typ is not trueseal+jwt', async () => {
    const signed = await new SignJWT({ ...claims() })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: KID })
      .sign(signingKey)
    await expect(verifyQrToken(signed, trustedPublicKey)).rejects.toThrow()
  })

  it('rejects wrong audience even when it was authentically signed', async () => {
    const signed = await new SignJWT({ ...claims(), aud: 'other-app' })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'trueseal+jwt', kid: KID })
      .sign(signingKey)
    await expect(verifyQrToken(signed, trustedPublicKey)).rejects.toThrow()
  })

  it('authenticates expired signatures separately from checking expiration', async () => {
    const expired = claims({ iat: 100, exp: 101 })
    const signed = await signQrToken(expired, KID, signingKey)
    const result = await verifyQrToken(signed, trustedPublicKey)
    expect(result.claims.exp).toBe(101)
    expect(isQrExpired(result.claims, 100)).toBe(false)
    expect(isQrExpired(result.claims, 101)).toBe(true)
    expect(isQrExpired(result.claims, 102)).toBe(true)
  })

  it('rejects missing claims and unsupported versions', async () => {
    const missingId = { ...claims() }; delete (missingId as Partial<typeof missingId>).jti
    const signedMissing = await new SignJWT(missingId)
      .setProtectedHeader({ alg: 'EdDSA', typ: 'trueseal+jwt', kid: KID })
      .sign(signingKey)
    const signedVersion = await new SignJWT({ ...claims(), v: 2 })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'trueseal+jwt', kid: KID })
      .sign(signingKey)
    await expect(verifyQrToken(signedMissing, trustedPublicKey)).rejects.toThrow()
    await expect(verifyQrToken(signedVersion, trustedPublicKey)).rejects.toThrow()
  })

  it('rejects unsigned, unexpected key-source headers without attempting a fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network prohibited'))
    const signed = await new SignJWT({ ...claims() })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'trueseal+jwt', kid: KID, jku: 'https://attacker.invalid/keys' })
      .sign(signingKey)
    await expect(verifyQrToken(signed, trustedPublicKey)).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('verifies with a separately imported serialized public JWK', async () => {
    const roundTrippedJwk = JSON.parse(JSON.stringify(publicJwk)) as JWK
    const imported = await importEd25519PublicJwk(roundTrippedJwk)
    const signed = await signQrToken(claims(), KID, signingKey)
    expect((await verifyQrToken(signed, imported)).claims.dst).toBe(claims().dst)
  })

  it('rejects private verification JWKs and non-Ed25519 JWKs', async () => {
    await expect(importEd25519PublicJwk(privateJwk)).rejects.toThrow('Invalid Ed25519 key')
    await expect(importEd25519PublicJwk({ ...publicJwk, crv: 'X25519' })).rejects.toThrow()
    await expect(importEd25519PublicJwk({ kty: 'oct', k: 'YWJj' })).rejects.toThrow()
    await expect(importEd25519PrivateJwk(publicJwk)).rejects.toThrow()
  })

  it('rejects insecure destinations and invalid time/IDs before signing', async () => {
    expect(() => validateSignedQrClaims(claims({ dst: 'http://example.edu/' }))).toThrow()
    expect(() => validateSignedQrClaims(claims({ dst: 'https://u:p@example.edu/' }))).toThrow()
    expect(() => validateSignedQrClaims(claims({ iat: 200, exp: 100 }))).toThrow()
    expect(() => validateSignedQrClaims(claims({ jti: '' }))).toThrow()
    await expect(signQrToken(claims(), 'unsafe kid with spaces', signingKey)).rejects.toThrow()
  })

  it('returns kid as a hint, not as a trusted-issuer determination', async () => {
    const signed = await signQrToken(claims(), 'unregistered-key', signingKey)
    const result = await verifyQrToken(signed, trustedPublicKey)
    expect(result.protectedHeader.kid).toBe('unregistered-key')
    // Issuer trust and kid-to-key mapping are deliberately deferred to CP04/CP07.
  })
})
