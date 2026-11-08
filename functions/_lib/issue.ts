import { importEd25519PrivateJwk, importEd25519PublicJwk, signQrToken, verifyQrToken } from './crypto'
import { DEMO_ISSUER_ID, DEMO_KID, type IssuerEnv } from './config'
import { expirationDays, parseDestination, parseTitle, publicOrigin } from './destinations'
import { HttpProblem, requireDatabase } from './http'
import { MAX_PRACTICAL_QR_BYTES } from '../../src/shared/qrLimits'
import type { SignedQrClaims } from '../../src/shared/types'
import type { IssuerSession } from './auth'
import type { JWK } from 'jose'

export interface CodeView {
  jti: string
  issuerId: string
  kid: string
  title: string
  destinationUrl: string
  signedToken: string
  verificationUrl: string
  issuedAt: number
  expiresAt: number
}

interface IssuerKeyRecord { kid: string; public_jwk: string }

function parsePrivateJwk(value: string | undefined): JWK {
  if (!value) throw new Error('Signing key is unavailable')
  let data: unknown
  try { data = JSON.parse(value) } catch { throw new Error('Signing key is unavailable') }
  if (typeof data !== 'object' || !data || Array.isArray(data)) throw new Error('Signing key is unavailable')
  return data as JWK
}

function parseRegisteredPublicJwk(value: string): JWK {
  const data: unknown = JSON.parse(value)
  if (typeof data !== 'object' || !data || Array.isArray(data)) throw new Error('Public key registry is unavailable')
  return data as JWK
}

function randomJti(): string {
  return crypto.randomUUID()
}

/** Protected issuance; session identity is authoritative, not anything in the request body. */
export async function issueCode(env: IssuerEnv, session: IssuerSession, body: Record<string, unknown>): Promise<CodeView> {
  const allowedFields = ['title', 'destinationUrl', 'expirationDays']
  if (Object.keys(body).some((key) => !allowedFields.includes(key))) {
    throw new HttpProblem(400, 'INVALID_REQUEST', 'Unrecognized issuance fields.')
  }
  const title = parseTitle(body.title)
  const { destination, hostname } = parseDestination(body.destinationUrl)
  const days = expirationDays(body.expirationDays)
  const origin = publicOrigin(env.TRUSEAL_PUBLIC_ORIGIN)
  const db = requireDatabase(env)

  // Only the configured demo issuer is provisioned with a signing secret in this milestone.
  if (session.issuerId !== DEMO_ISSUER_ID || env.TRUSEAL_SIGNING_KID !== DEMO_KID) {
    throw new HttpProblem(403, 'ISSUANCE_DISABLED', 'Issuance is not enabled for this issuer.')
  }
  const row = await db.prepare(`
    SELECT k.kid, k.public_jwk FROM issuer_keys k
    JOIN issuers i ON i.id = k.issuer_id
    JOIN issuer_allowed_hosts h ON h.issuer_id = i.id
    WHERE i.id = ? AND i.status = 'active' AND k.status = 'active' AND k.kid = ? AND h.hostname = ?
  `).bind(session.issuerId, DEMO_KID, hostname).first<IssuerKeyRecord>()
  if (!row) throw new HttpProblem(403, 'ISSUANCE_DISABLED', 'Destination or signing authority not approved.')

  // Refuse to sign unless the configured private key actually corresponds to the registered public key.
  const privateKey = await importEd25519PrivateJwk(parsePrivateJwk(env.TRUSEAL_SIGNING_PRIVATE_JWK))
  const publicKey = await importEd25519PublicJwk(parseRegisteredPublicJwk(row.public_jwk))
  const now = Math.floor(Date.now() / 1000)
  const claims: SignedQrClaims = {
    iss: session.issuerId,
    aud: 'trueseal-qr',
    jti: randomJti(),
    iat: now,
    exp: now + days * 24 * 60 * 60,
    dst: destination,
    v: 1,
  }
  const token = await signQrToken(claims, row.kid, privateKey)
  // Key-pair mismatch, revoked key registry data, or signing malfunction must fail closed.
  await verifyQrToken(token, publicKey)
  if (token.length > 2048) throw new HttpProblem(400, 'QR_TOO_LONG', 'Signed token exceeds the supported length.')
  const verificationUrl = `${origin}/v/${token}`
  if (new TextEncoder().encode(verificationUrl).byteLength > MAX_PRACTICAL_QR_BYTES) {
    throw new HttpProblem(400, 'QR_TOO_LONG', 'Signed QR is too dense for reliable scanning.')
  }

  // Repeat the trust/host checks INSIDE the insertion statement. A concurrent
  // key/issuer disable or host-policy removal cannot race past an earlier SELECT.
  const stored = await db.prepare(`
    INSERT INTO codes (jti, issuer_id, kid, title, destination_url, signed_token, issued_at, expires_at, revoked_at)
    SELECT ?, i.id, k.kid, ?, ?, ?, ?, ?, NULL
    FROM issuers i JOIN issuer_keys k ON k.issuer_id = i.id
    JOIN issuer_allowed_hosts h ON h.issuer_id = i.id
    WHERE i.id = ? AND i.status = 'active' AND k.kid = ? AND k.status = 'active' AND h.hostname = ?
    RETURNING jti
  `).bind(claims.jti, title, destination, token, now, claims.exp, session.issuerId, row.kid, hostname)
    .first<{ jti: string }>()
  if (stored?.jti !== claims.jti) throw new Error('Code persistence denied')

  return {
    jti: claims.jti,
    issuerId: session.issuerId,
    kid: row.kid,
    title,
    destinationUrl: destination,
    signedToken: token,
    verificationUrl,
    issuedAt: now,
    expiresAt: claims.exp,
  }
}

export function toSafeCodeView(row: {
  jti: string; issuer_id: string; kid: string; title: string; destination_url: string;
  signed_token: string; issued_at: number; expires_at: number
}, origin: string): CodeView {
  return {
    jti: row.jti, issuerId: row.issuer_id, kid: row.kid, title: row.title,
    destinationUrl: row.destination_url, signedToken: row.signed_token,
    verificationUrl: `${origin}/v/${row.signed_token}`,
    issuedAt: row.issued_at, expiresAt: row.expires_at,
  }
}

export const CODE_COLUMNS = 'jti, issuer_id, kid, title, destination_url, signed_token, issued_at, expires_at'
