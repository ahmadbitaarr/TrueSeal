import { HttpProblem } from './http'

/** Reject ASCII control characters without relying on a control-character regex. */
function hasControlChars(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })
}

/** Validate a destination before consulting a registered issuer's exact host allowlist. */
export function parseDestination(value: unknown): { destination: string; hostname: string } {
  if (typeof value !== 'string' || value.length < 1 || value.length > 240 || value.trim() !== value || (hasControlChars(value) || value.includes('\\'))) {
    throw new HttpProblem(400, 'INVALID_DESTINATION', 'Enter a valid approved HTTPS destination.')
  }
  let url: URL
  try { url = new URL(value) } catch { throw new HttpProblem(400, 'INVALID_DESTINATION', 'Enter a valid approved HTTPS destination.') }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !host ||
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.') ||
    host.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    throw new HttpProblem(400, 'INVALID_DESTINATION', 'Enter a valid approved HTTPS destination.')
  }
  return { destination: value, hostname: host }
}

export function parseTitle(value: unknown): string {
  if (typeof value !== 'string' || !value || value.trim() !== value ||
    Array.from(value).length > 64 || hasControlChars(value)) {
    throw new HttpProblem(400, 'INVALID_TITLE', 'Title must be 1–64 characters.')
  }
  return value
}

export function expirationDays(value: unknown): 1 | 7 | 30 {
  if (value === undefined) return 7
  if (value !== 1 && value !== 7 && value !== 30) {
    throw new HttpProblem(400, 'INVALID_EXPIRATION', 'Expiration must be 1, 7, or 30 days.')
  }
  return value
}

export function publicOrigin(value: string | undefined): string {
  // Never use a user-supplied Host header to produce verification URLs.
  if (!value) throw new Error('Public origin is not configured')
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' || parsed.port || parsed.hostname.endsWith('.')) {
    throw new Error('Public origin is not a configured HTTPS origin')
  }
  if (parsed.origin !== value) throw new Error('Public origin must be a canonical HTTPS origin')
  return parsed.origin
}
