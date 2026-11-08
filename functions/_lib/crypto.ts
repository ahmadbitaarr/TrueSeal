import { compactVerify, importJWK, SignJWT, type JWK } from 'jose'
import type {
  AuthenticatedQrToken,
  SignedQrClaims,
  SignedQrProtectedHeader,
} from '../../src/shared/types'

const AUDIENCE = 'trueseal-qr'
const TYPE = 'trueseal+jwt'
const ALGORITHM = 'EdDSA'
const TOKEN_VERSION = 1
const MAX_TOKEN_LENGTH = 8192
const CLAIM_FIELDS = ['iss', 'aud', 'jti', 'iat', 'exp', 'dst', 'v']
const HEADER_FIELDS = ['alg', 'typ', 'kid']
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

/** Safe to pass to a public route as a generic error, without crypto internals. */
export class InvalidQrTokenError extends Error {
  constructor() {
    super('Invalid signed QR token')
    this.name = 'InvalidQrTokenError'
  }
}

export class InvalidQrKeyError extends Error {
  constructor() {
    super('Invalid Ed25519 key')
    this.name = 'InvalidQrKeyError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonemptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && value.trim() === value
}

function hasExactlyFields(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(record)
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key))
}

function validDestination(value: unknown): value is string {
  if (!isNonemptyString(value, 4096)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.host.length > 0 && url.username === '' && url.password === ''
  } catch {
    return false
  }
}

/** Pure structural validation; no expiry or issuer-trust decision is made. */
export function validateSignedQrClaims(value: unknown): SignedQrClaims {
  if (!isRecord(value) || !hasExactlyFields(value, CLAIM_FIELDS)) throw new InvalidQrTokenError()
  if (!isNonemptyString(value.iss, 256) || !isNonemptyString(value.jti, 256)) {
    throw new InvalidQrTokenError()
  }
  if (value.aud !== AUDIENCE || value.v !== TOKEN_VERSION) throw new InvalidQrTokenError()
  if (!Number.isSafeInteger(value.iat) || !Number.isSafeInteger(value.exp)) {
    throw new InvalidQrTokenError()
  }
  if (typeof value.iat !== 'number' || typeof value.exp !== 'number' || value.iat < 0 || value.exp <= value.iat) {
    throw new InvalidQrTokenError()
  }
  if (!validDestination(value.dst)) throw new InvalidQrTokenError()

  return value as unknown as SignedQrClaims
}

function validKeyId(value: unknown): value is string {
  return typeof value === 'string' && KEY_ID_PATTERN.test(value)
}

function validateProtectedHeader(value: unknown): SignedQrProtectedHeader {
  if (!isRecord(value) || !hasExactlyFields(value, HEADER_FIELDS)) throw new InvalidQrTokenError()
  if (value.alg !== ALGORITHM || value.typ !== TYPE || !validKeyId(value.kid)) {
    throw new InvalidQrTokenError()
  }
  return { alg: ALGORITHM, typ: TYPE, kid: value.kid }
}

function validateEd25519Jwk(value: JWK, usage: 'sign' | 'verify'): void {
  if (!isRecord(value) || value.kty !== 'OKP' || value.crv !== 'Ed25519') {
    throw new InvalidQrKeyError()
  }
  if (typeof value.x !== 'string' || !BASE64URL_PATTERN.test(value.x)) {
    throw new InvalidQrKeyError()
  }
  if (usage === 'sign') {
    if (typeof value.d !== 'string' || !BASE64URL_PATTERN.test(value.d)) {
      throw new InvalidQrKeyError()
    }
  } else if ('d' in value) {
    // A verification registry must never load private material.
    throw new InvalidQrKeyError()
  }
  if (value.alg !== undefined && value.alg !== ALGORITHM) throw new InvalidQrKeyError()
  if (value.use !== undefined && value.use !== 'sig') throw new InvalidQrKeyError()
  if (value.key_ops !== undefined && (!Array.isArray(value.key_ops) || !value.key_ops.includes(usage))) {
    throw new InvalidQrKeyError()
  }
}

function requireEd25519CryptoKey(
  key: Awaited<ReturnType<typeof importJWK>>,
  usage: 'sign' | 'verify',
): CryptoKey {
  if (!(key instanceof CryptoKey)) throw new InvalidQrKeyError()
  if (key.algorithm.name !== 'Ed25519' || key.type !== (usage === 'sign' ? 'private' : 'public')) {
    throw new InvalidQrKeyError()
  }
  if (!key.usages.includes(usage)) throw new InvalidQrKeyError()
  return key
}

/** Import only explicitly provided private JWKs. Never persist or log them here. */
export async function importEd25519PrivateJwk(jwk: JWK): Promise<CryptoKey> {
  validateEd25519Jwk(jwk, 'sign')
  try {
    return requireEd25519CryptoKey(await importJWK(jwk, ALGORITHM), 'sign')
  } catch {
    throw new InvalidQrKeyError()
  }
}

/** Import a public JWK supplied by a trusted caller, not by a token header. */
export async function importEd25519PublicJwk(jwk: JWK): Promise<CryptoKey> {
  validateEd25519Jwk(jwk, 'verify')
  try {
    return requireEd25519CryptoKey(await importJWK(jwk, ALGORITHM), 'verify')
  } catch {
    throw new InvalidQrKeyError()
  }
}

/** Make a standards-based compact JWS containing a JWT claims set. */
export async function signQrToken(
  claims: SignedQrClaims,
  kid: string,
  signingKey: CryptoKey,
): Promise<string> {
  const validatedClaims = validateSignedQrClaims(claims)
  if (!validKeyId(kid)) throw new InvalidQrTokenError()
  requireEd25519CryptoKey(signingKey, 'sign')

  return new SignJWT({ ...validatedClaims })
    .setProtectedHeader({ alg: ALGORITHM, typ: TYPE, kid })
    .sign(signingKey)
}

/**
 * Verify the JWS cryptographically with a previously trusted, supplied key.
 * Intentionally does NOT reject expired claims or establish issuer trust:
 * CP07 must distinguish EXPIRED from INVALID_SIGNATURE and perform a trusted
 * issuer/kid lookup before calling this primitive.
 */
export async function verifyQrToken(
  compactToken: string,
  trustedPublicKey: CryptoKey,
): Promise<AuthenticatedQrToken> {
  if (typeof compactToken !== 'string' || compactToken.length > MAX_TOKEN_LENGTH || compactToken.split('.').length !== 3) {
    throw new InvalidQrTokenError()
  }
  requireEd25519CryptoKey(trustedPublicKey, 'verify')

  let verified: Awaited<ReturnType<typeof compactVerify>>
  try {
    verified = await compactVerify(compactToken, trustedPublicKey, { algorithms: [ALGORITHM] })
  } catch {
    // Never forward a cryptographic implementation error to an API client.
    throw new InvalidQrTokenError()
  }

  const protectedHeader = validateProtectedHeader(verified.protectedHeader)
  let rawClaims: unknown
  try {
    rawClaims = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(verified.payload)) as unknown
  } catch {
    throw new InvalidQrTokenError()
  }
  const claims = validateSignedQrClaims(rawClaims)
  return { claims, protectedHeader }
}

/** Expiry is a separate, deterministic policy check after signature verification. */
export function isQrExpired(
  claims: Pick<SignedQrClaims, 'exp'>,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) throw new RangeError('Invalid check time')
  return claims.exp <= nowSeconds
}
