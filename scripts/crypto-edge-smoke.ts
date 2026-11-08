/**
 * LOCAL-ONLY Wrangler Worker smoke test for workerd compatibility.
 * Not referenced by Cloudflare Pages build or by functions/api, and never
 * deployed. Ephemeral signing keys never leave the worker response/logs.
 *
 * Run from repo root:
 *   npx wrangler dev --config scripts/wrangler-crypto-smoke.jsonc --local --port 8789
 * Then, in another terminal:
 *   curl -fsS http://127.0.0.1:8789/
 */
import { exportJWK, generateKeyPair } from 'jose'
import {
  importEd25519PrivateJwk,
  importEd25519PublicJwk,
  isQrExpired,
  signQrToken,
  verifyQrToken,
} from '../functions/_lib/crypto'
import type { SignedQrClaims } from '../src/shared/types'

const fixture: SignedQrClaims = {
  iss: 'edge-smoke-issuer',
  aud: 'trueseal-qr',
  jti: 'edge-smoke-1',
  iat: 100,
  exp: 101,
  dst: 'https://example.edu/',
  v: 1,
}

export default {
  async fetch(): Promise<Response> {
    try {
      const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
        crv: 'Ed25519',
        extractable: true,
      })
      const signingKey = await importEd25519PrivateJwk(await exportJWK(privateKey))
      const verificationKey = await importEd25519PublicJwk(await exportJWK(publicKey))
      const token = await signQrToken(fixture, 'smoke-key', signingKey)
      const authenticated = await verifyQrToken(token, verificationKey)
      const verified = authenticated.claims.jti === fixture.jti &&
        authenticated.protectedHeader.alg === 'EdDSA' &&
        isQrExpired(authenticated.claims, 102)
      return Response.json(
        { status: verified ? 'ok' : 'error', ed25519: verified ? 'verified' : 'failed', runtime: 'workerd' },
        { status: verified ? 200 : 500, headers: { 'cache-control': 'no-store' } },
      )
    } catch {
      return Response.json(
        { status: 'error', ed25519: 'failed', runtime: 'workerd' },
        { status: 500, headers: { 'cache-control': 'no-store' } },
      )
    }
  },
}
