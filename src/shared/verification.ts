export type VerificationStatus = 'VERIFIED' | 'UNKNOWN' | 'INVALID' | 'EXPIRED' | 'REVOKED' | 'CAUTION' | 'UNAVAILABLE'

export interface VerificationResult {
  status: VerificationStatus
  message: string
  issuer?: { id: string; displayName: string; trustTier: string }
  title?: string
  destination?: string
  issuedAt?: number
  expiresAt?: number
}
