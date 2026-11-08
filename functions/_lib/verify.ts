import { decodeProtectedHeader, decodeJwt, type JWK } from 'jose'
import { importEd25519PublicJwk, InvalidQrTokenError, isQrExpired, verifyQrToken } from './crypto'
import type { IssuerEnv } from './config'
import { parseDestination, publicOrigin } from './destinations'
import { requireDatabase } from './http'
import type { SignedQrClaims } from '../../src/shared/types'
import type { VerificationResult, VerificationStatus } from '../../src/shared/verification'

interface RegistryRow {
  issuer_id: string
  display_name: string
  trust_tier: string
  issuer_status: string
  kid: string
  key_status: string
  public_jwk: string
}
interface IssuedRow {
  jti: string
  issuer_id: string
  kid: string
  title: string
  destination_url: string
  signed_token: string
  issued_at: number
  expires_at: number
  revoked_at: number | null
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const MAX_INPUT = 10000
const messages: Record<VerificationStatus, string> = {
  VERIFIED: 'This QR was signed by a registered issuer, its record and destination match, and it is currently valid.',
  UNKNOWN: 'This QR is not a recognized registered TrueSeal code. Do not treat it as verified.',
  INVALID: 'This TrueSeal code is malformed, altered, or fails the integrity checks.',
  EXPIRED: 'This authentic TrueSeal code has expired.',
  REVOKED: 'This TrueSeal code has been revoked. Do not use its destination.',
  CAUTION: 'This code was signed, but its issuer, key, or destination is no longer approved.',
  UNAVAILABLE: 'Verification is temporarily unavailable. The QR has not been verified.',
}
function result(status: VerificationStatus): VerificationResult { return { status, message: messages[status] } }

/** Accept only the configured origin's /v/<compact JWS> URL, or a standalone compact JWS. */
export function extractVerificationToken(value: unknown, configuredOrigin: string): string | null {
  if (typeof value !== 'string' || !value || value.length > MAX_INPUT || value.trim() !== value) return null
  let candidate = value
  if (value.startsWith('https://')) {
    let url: URL
    try { url = new URL(value) } catch { return null }
    if (url.origin !== configuredOrigin || url.username || url.password || url.search || url.hash || url.port) return null
    const match = /^\/v\/([^/]+)$/.exec(url.pathname)
    if (!match) return null
    candidate = match[1]
  }
  if (candidate.length > 2048 || !TOKEN_PATTERN.test(candidate)) return null
  return candidate
}

/** Verifies cryptographic authenticity *before* consulting issued-code metadata. */
export async function verifyPublicQr(env: IssuerEnv, input: unknown, now = Math.floor(Date.now() / 1000)): Promise<VerificationResult> {
  let origin: string
  try { origin = publicOrigin(env.TRUSEAL_PUBLIC_ORIGIN) } catch { return result('UNAVAILABLE') }
  const token = extractVerificationToken(input, origin)
  if (!token) return result('UNKNOWN')

  let header: ReturnType<typeof decodeProtectedHeader>
  let hintedClaims: ReturnType<typeof decodeJwt>
  try {
    header = decodeProtectedHeader(token)
    hintedClaims = decodeJwt(token)
  } catch { return result('INVALID') }
  if (header.alg !== 'EdDSA' || header.typ !== 'trueseal+jwt' || typeof header.kid !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(header.kid) ||
    Object.keys(header).length !== 3) return result('INVALID')
  if (typeof hintedClaims.iss !== 'string' || hintedClaims.iss.length > 256) return result('INVALID')

  // Both the issuer and kid originate from untrusted token content: they are hints only.
  // We never load a token-provided JWK/URL or grant trust from these fields alone.
  let db: D1Database
  try { db = requireDatabase(env) } catch { return result('UNAVAILABLE') }
  try {
    const registered = await db.prepare(`
      SELECT i.id AS issuer_id, i.display_name, i.trust_tier, i.status AS issuer_status,
             k.kid, k.status AS key_status, k.public_jwk
      FROM issuer_keys k JOIN issuers i ON i.id = k.issuer_id
      WHERE k.kid = ? AND i.id = ?
    `).bind(header.kid, hintedClaims.iss).first<RegistryRow>()
    if (!registered) return result('UNKNOWN')

    let publicKey: CryptoKey
    try { publicKey = await importEd25519PublicJwk(JSON.parse(registered.public_jwk) as JWK) }
    catch { return result('UNAVAILABLE') } // The trusted registry is corrupt, not a legitimate verification failure.
    let claims: SignedQrClaims
    try {
      const authenticated = await verifyQrToken(token, publicKey)
      claims = authenticated.claims
      if (authenticated.protectedHeader.kid !== registered.kid || claims.iss !== registered.issuer_id) return result('INVALID')
    } catch (error) {
      if (error instanceof InvalidQrTokenError) return result('INVALID')
      return result('UNAVAILABLE')
    }

    const issued = await db.prepare(`
      SELECT jti, issuer_id, kid, title, destination_url, signed_token, issued_at, expires_at, revoked_at
      FROM codes WHERE jti = ? AND issuer_id = ? AND kid = ?
    `).bind(claims.jti, claims.iss, registered.kid).first<IssuedRow>()
    if (!issued) return result('UNKNOWN')
    if (issued.signed_token !== token || issued.destination_url !== claims.dst ||
      issued.issued_at !== claims.iat || issued.expires_at !== claims.exp ||
      issued.issuer_id !== claims.iss || issued.kid !== registered.kid) return result('INVALID')

    // A revoked and expired QR is REVOKED. No destination details are released for non-verified states.
    if (issued.revoked_at !== null) return result('REVOKED')
    if (isQrExpired(claims, now)) return result('EXPIRED')
    if (registered.issuer_status !== 'active' || registered.key_status !== 'active') return result('CAUTION')
    let hostname: string
    try { hostname = parseDestination(claims.dst).hostname } catch { return result('INVALID') }
    const allowed = await db.prepare('SELECT hostname FROM issuer_allowed_hosts WHERE issuer_id = ? AND hostname = ?')
      .bind(registered.issuer_id, hostname).first<{ hostname: string }>()
    if (!allowed) return result('CAUTION')
    if (registered.trust_tier !== 'demo' && registered.trust_tier !== 'verified') return result('CAUTION')

    return {
      ...result('VERIFIED'),
      issuer: { id: registered.issuer_id, displayName: registered.display_name, trustTier: registered.trust_tier },
      title: issued.title,
      destination: claims.dst,
      issuedAt: claims.iat,
      expiresAt: claims.exp,
    }
  } catch {
    // A missing/broken binding, failed read, or internal error cannot produce VERIFIED.
    return result('UNAVAILABLE')
  }
}
