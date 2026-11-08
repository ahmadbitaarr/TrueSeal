import { useEffect, useState, type FormEvent } from 'react'
import { generateQRCode } from '../lib/qr'

interface IssuerInfo { issuerId: string; displayName: string; trustTier: string; expiresAt: number }
interface IssuedCode {
  jti: string; title: string; destinationUrl: string; verificationUrl: string; issuedAt: number; expiresAt: number
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  const content: unknown = await response.json()
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw new Error('Unexpected response from server.')
  return content as Record<string, unknown>
}

export default function OrganizationPortal({ onHome }: { onHome: () => void }) {
  const [issuer, setIssuer] = useState<IssuerInfo | null>(null)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [title, setTitle] = useState('Hackathon demo')
  const [destinationUrl, setDestinationUrl] = useState('https://trueseal-431.pages.dev/demo')
  const [expirationDays, setExpirationDays] = useState<1 | 7 | 30>(7)
  const [latest, setLatest] = useState<{ code: IssuedCode; image: string } | null>(null)
  const [recent, setRecent] = useState<IssuedCode[]>([])

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
        if (response.ok) {
          const data = await readResponse(response)
          if (data.issuer && typeof data.issuer === 'object') setIssuer(data.issuer as IssuerInfo)
        }
      } catch { /* No session; never invent authentication on network failure. */ }
      finally { if (!controller.signal.aborted) setChecking(false) }
    })()
    return () => controller.abort()
  }, [])

  async function refreshCodes(): Promise<void> {
    const response = await fetch('/api/issuer/codes', { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) return
    const data = await readResponse(response)
    if (Array.isArray(data.codes)) setRecent((data.codes as IssuedCode[]).slice(0, 5))
  }

  async function signIn(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
        credentials: 'same-origin', cache: 'no-store', body: JSON.stringify({ accessKey }) })
      if (!response.ok) throw new Error(response.status === 429 ? 'Too many attempts. Try again later.' : 'Sign-in failed. Check the access key.')
      const data = await readResponse(response)
      if (!data.issuer || typeof data.issuer !== 'object') throw new Error('Sign-in response was incomplete.')
      setIssuer(data.issuer as IssuerInfo)
      setAccessKey('')
      void refreshCodes().catch(() => {})
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Sign-in unavailable.') }
    finally { setBusy(false) }
  }

  async function issue(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setBusy(true); setMessage(''); setLatest(null)
    try {
      const response = await fetch('/api/issuer/codes', { method: 'POST', headers: { 'content-type': 'application/json' },
        credentials: 'same-origin', cache: 'no-store', body: JSON.stringify({ title, destinationUrl, expirationDays }) })
      const data = await readResponse(response)
      if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Could not issue QR code.')
      const code = data.code as IssuedCode
      if (!code?.verificationUrl || typeof code.verificationUrl !== 'string') throw new Error('Issuance response missing verification URL.')
      const image = await generateQRCode(code.verificationUrl)
      setLatest({ code, image })
      void refreshCodes().catch(() => {})
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Issuance failed.') }
    finally { setBusy(false) }
  }

  async function signOut(): Promise<void> {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) throw new Error('Logout failed. Please try again.')
      setIssuer(null); setLatest(null); setRecent([]); setAccessKey('')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Logout unavailable.') }
    finally { setBusy(false) }
  }

  return (
    <section className="mx-auto mt-10 max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-3xl font-bold">Organization access</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Protected access for the TrueSeal Demo Organization. This is not a Virginia Tech department or a public registration portal.</p>
      {checking ? <p className="mt-5" role="status">Checking issuer session…</p> : issuer ? (
        <>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
            <div><p className="font-semibold">{issuer.displayName}</p><p className="text-xs text-slate-600">Demonstration issuer</p></div>
            <button disabled={busy} onClick={() => void signOut()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Logout</button>
          </div>
          <form onSubmit={(event) => void issue(event)} className="mt-6 space-y-4">
            <label className="block text-sm font-semibold">QR title
              <input required maxLength={64} value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 p-3" />
            </label>
            <label className="block text-sm font-semibold">Approved HTTPS destination
              <input required type="url" maxLength={240} value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 p-3" />
            </label>
            <label className="block text-sm font-semibold">Expires in
              <select value={expirationDays} onChange={(e) => setExpirationDays(Number(e.target.value) as 1 | 7 | 30)} className="mt-1 block w-full rounded-lg border border-slate-300 p-3">
                <option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option>
              </select>
            </label>
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#15803D] px-5 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Working…' : 'Issue signed QR code'}</button>
          </form>
          {latest && <div className="mt-6 rounded-xl border border-green-200 p-4 text-center">
            <h2 className="font-bold">Signed QR created</h2>
            <img src={latest.image} alt={`Signed QR for ${latest.code.title}`} className="mx-auto mt-3 w-full max-w-72" />
            <a href={latest.image} download={`trueseal-${latest.code.jti}.png`} className="mt-3 inline-flex rounded-xl bg-[#101C34] px-5 py-3 font-semibold text-white">Download QR PNG</a>
            <p className="mt-3 break-all text-xs text-slate-600">{latest.code.verificationUrl}</p>
          </div>}
          {recent.length > 0 && <div className="mt-7"><h2 className="font-semibold">Recent issued codes</h2><ul className="mt-3 space-y-2">{recent.map((code) => <li key={code.jti} className="rounded-lg bg-slate-50 p-3 text-sm"><span className="font-semibold">{code.title}</span><p className="mt-1 break-all text-xs text-slate-600">{code.destinationUrl}</p></li>)}</ul></div>}
        </>
      ) : (
        <form onSubmit={(event) => void signIn(event)} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold">Issuer access key
            <input required type="password" autoComplete="off" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3" />
          </label>
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#101C34] px-5 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      )}
      {message && <p className="mt-4 text-sm text-red-700" role="alert">{message}</p>}
      <button type="button" onClick={onHome} className="mt-8 text-sm font-semibold text-[#101C34]">Back to home</button>
    </section>
  )
}
