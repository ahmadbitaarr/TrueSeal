/** Public, serializable QR claims. No signing credentials belong in this module. */
export interface SignedQrClaims {
  iss: string
  aud: 'trueseal-qr'
  jti: string
  iat: number
  exp: number
  dst: string
  v: 1
}

export interface SignedQrProtectedHeader {
  alg: 'EdDSA'
  typ: 'trueseal+jwt'
  kid: string
}

/** Authentication of a signature does not assert that an issuer is trusted. */
export interface AuthenticatedQrToken {
  claims: SignedQrClaims
  protectedHeader: SignedQrProtectedHeader
}
