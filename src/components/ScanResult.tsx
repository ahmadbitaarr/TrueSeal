import { useEffect, useState } from 'react'
import type { VerificationResult, VerificationStatus } from '../shared/verification'

interface ScanResultProps {
  value: string
  onAgain: () => void
  onHome: () => void
}

const statuses: Record<VerificationStatus, { label: string; theme: string }> = {
  VERIFIED: { label: 'Verified', theme: 'bg-green-100 text-green-900' },
  UNKNOWN: { label: 'Unknown QR', theme: 'bg-slate-100 text-slate-800' },
  INVALID: { label: 'Invalid QR', theme: 'bg-red-100 text-red-900' },
  EXPIRED: { label: 'Expired', theme: 'bg-amber-100 text-amber-900' },
  REVOKED: { label: 'Revoked', theme: 'bg-red-100 text-red-900' },
  CAUTION: { label: 'Caution', theme: 'bg-amber-100 text-amber-900' },
  UNAVAILABLE: { label: 'Verification unavailable', theme: 'bg-slate-100 text-slate-800' },
}

const fallback: VerificationResult = {
  status: 'UNAVAILABLE',
  message: 'The verification service could not be reached. This QR has not been verified.',
}
const allowed = new Set<VerificationStatus>(Object.keys(statuses) as VerificationStatus[])
function safeVerifiedDestination(response: VerificationResult): string | null {
  if (response.status !== 'VERIFIED' || typeof response.destination !== 'string' ||
    typeof response.issuer?.displayName !== 'string') return null
  try {
    const url = new URL(response.destination)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hostname.endsWith('.')) return null
    return response.destination
  } catch { return null }
}

export default function ScanResult({ value, onAgain, onHome }: ScanResultProps) {
  const [result, setResult] = useState<VerificationResult | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    async function check() {
      try {
        const response = await fetch('/api/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value }),
          signal: controller.signal,
          credentials: 'omit',
          cache: 'no-store',
        })
        const body: unknown = await response.json()
        if (!body || typeof body !== 'object' || !('status' in body) ||
          !allowed.has((body as VerificationResult).status) || !('message' in body) ||
          typeof (body as VerificationResult).message !== 'string') throw new Error('Unexpected verification response')
        const candidate = body as VerificationResult
        if (response.ok && candidate.status === 'VERIFIED' && !safeVerifiedDestination(candidate)) throw new Error('Invalid verified destination')
        if (!controller.signal.aborted) setResult(response.ok ? candidate : fallback)
      } catch {
        if (!controller.signal.aborted) setResult(fallback)
      }
    }
    void check()
    return () => controller.abort()
  }, [value])

  const verifiedDestination = result ? safeVerifiedDestination(result) : null
  const displayed = result?.status === 'VERIFIED' && !verifiedDestination ? fallback : result

  return (
    <section className="mx-auto mt-12 max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-live="polite">
      {displayed ? (
        <span role="status" className={`inline-flex rounded-full px-3 py-1.5 text-sm font-bold ${statuses[displayed.status].theme}`}>
          {statuses[displayed.status].label}
        </span>
      ) : <span role="status" className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-800">Checking QR…</span>}
      <h1 className="mt-4 text-3xl font-bold">{displayed?.status === 'VERIFIED' ? 'QR authenticity verified' : 'QR verification result'}</h1>
      <p className="mt-3 leading-7 text-slate-600">{displayed?.message ?? 'Checking the registered issuer, signature, destination, expiration, and revocation status…'}</p>
      {displayed?.status === 'VERIFIED' && verifiedDestination ? (
        <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="font-semibold">{displayed.issuer?.displayName}</p>
          <p className="mt-1 text-xs uppercase text-green-900">{displayed.issuer?.trustTier === 'demo' ? 'Demonstration issuer — not a Virginia Tech department' : 'Registered issuer'}</p>
          {displayed.title && <p className="mt-3 text-sm">{displayed.title}</p>}
          <p className="mt-3 text-sm font-semibold">Signed destination</p>
          <p className="break-all text-sm">{verifiedDestination}</p>
          <a href={verifiedDestination} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex rounded-xl bg-[#15803D] px-5 py-3 font-semibold text-white">Open Destination</a>
          <p className="mt-3 text-xs text-slate-600">The destination opens only when you choose this link.</p>
        </div>
      ) : null}
      <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Show scanned content</summary>
        <div className="mt-3 max-h-48 overflow-auto break-all text-xs text-slate-700" data-testid="qr-raw-content">{value}</div>
      </details>
      {displayed?.status !== 'VERIFIED' && <p className="mt-3 text-sm font-medium text-amber-800">No destination will open automatically. Unverified QR content should not be trusted.</p>}
      <div className="mt-7 flex flex-wrap gap-3">
        <button type="button" onClick={onAgain} className="rounded-xl bg-[#101C34] px-5 py-3 font-semibold text-white">Scan another</button>
        <button type="button" onClick={onHome} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold">Back to home</button>
      </div>
    </section>
  )
}
