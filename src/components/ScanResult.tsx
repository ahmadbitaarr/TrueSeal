interface ScanResultProps {
  value: string
  onAgain: () => void
  onHome: () => void
}

export default function ScanResult({ value, onAgain, onHome }: ScanResultProps) {
  return (
    <section className="mx-auto mt-12 max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-live="polite">
      <div className="inline-flex rounded-full bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-900">Unverified</div>
      <h1 className="mt-4 text-3xl font-bold">QR content detected</h1>
      <p className="mt-3 leading-7 text-slate-600">
        This is decoded QR content only. TrueSeal has not checked its signature, issuer, destination, expiration, or revocation.
      </p>
      <div className="mt-5 max-h-56 overflow-auto break-all rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800" data-testid="qr-raw-content">
        {value}
      </div>
      <p className="mt-3 text-sm font-medium text-amber-800">Do not treat this content as trusted. No destination will open automatically.</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <button type="button" onClick={onAgain} className="rounded-xl bg-[#15803D] px-5 py-3 font-semibold text-white">Scan another</button>
        <button type="button" onClick={onHome} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold">Back to home</button>
      </div>
    </section>
  )
}
