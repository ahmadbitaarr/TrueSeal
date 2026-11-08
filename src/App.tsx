import { useState } from 'react'
import { ArrowLeft, ArrowRight, Camera, Check, ImageUp, LockKeyhole, ShieldCheck } from 'lucide-react'

type Screen = 'home' | 'scan' | 'upload' | 'organizations'

const placeholderContent: Record<Exclude<Screen, 'home'>, { heading: string; body: string }> = {
  scan: {
    heading: 'Camera scanning is coming soon',
    body: 'The QR camera scanner has not been implemented. No camera access or QR verification occurs in this checkpoint.',
  },
  upload: {
    heading: 'Image upload is coming soon',
    body: 'Image decoding and QR verification have not been implemented. No file is uploaded or analyzed.',
  },
  organizations: {
    heading: 'Organization access is coming soon',
    body: 'Issuer sign-in and signed QR issuance will be added in later checkpoints. There is no active organization portal yet.',
  },
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#101C34]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8 sm:py-8">
        <button aria-label="TrueSeal home" className="flex items-center gap-2.5 rounded-md text-left" onClick={() => setScreen('home')}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#101C34] text-white"><ShieldCheck size={24} strokeWidth={2.25} aria-hidden="true" /></span>
          <span className="text-xl font-bold tracking-tight">TrueSeal</span>
        </button>
        <button onClick={() => setScreen('organizations')} className="rounded-lg px-2 py-2 text-sm font-semibold text-[#35435A] transition hover:text-[#15803D] sm:px-4">For organizations <ArrowRight className="ml-1 inline" size={15} aria-hidden="true" /></button>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
        {screen === 'home' ? (
          <section className="relative mx-auto mt-8 grid max-w-5xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_90px_-55px_rgba(16,28,52,0.4)] md:mt-14 md:grid-cols-[1.14fr_0.86fr]">
            <div className="px-6 py-12 sm:px-12 sm:py-16 lg:px-16 lg:py-20">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-[#15803D]"><ShieldCheck size={15} aria-hidden="true" /> Built for safer QR decisions</div>
              <h1 className="max-w-lg text-[clamp(2.45rem,5vw,4.25rem)] font-bold leading-[1.08] tracking-[-0.045em]">Scan with confidence.</h1>
              <p className="mt-5 max-w-md text-base leading-7 text-slate-600 sm:text-lg">Check who signed a QR code and where it leads.</p>
              <div className="mt-9 flex max-w-sm flex-col gap-3">
                <button className="flex min-h-13 w-full items-center justify-center gap-3 rounded-xl bg-[#15803D] px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-[#11652F]" onClick={() => setScreen('scan')}><Camera size={20} aria-hidden="true" /> Scan QR Code <ArrowRight className="ml-auto" size={18} aria-hidden="true" /></button>
                <button className="flex min-h-13 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-[#101C34] transition hover:bg-slate-50" onClick={() => setScreen('upload')}><ImageUp size={20} aria-hidden="true" /> Upload QR Image <ArrowRight className="ml-auto" size={18} aria-hidden="true" /></button>
              </div>
              <p className="mt-5 flex items-start gap-2 text-sm leading-6 text-slate-500"><LockKeyhole className="mt-1 shrink-0" size={14} aria-hidden="true" /> No account required. Links never open automatically.</p>
            </div>
            <div aria-hidden="true" className="relative hidden min-h-[440px] items-center justify-center overflow-hidden bg-[#101C34] md:flex">
              <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/10" />
              <div className="absolute -left-28 -bottom-28 h-72 w-72 rounded-full border border-white/10" />
              <div className="relative w-64 rounded-3xl border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur-sm">
                <div className="mb-6 flex items-center justify-between"><span className="text-sm font-semibold text-white">A better way to scan</span><ShieldCheck className="text-green-300" size={21} /></div>
                <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-2xl bg-white/95">
                  <ShieldCheck className="text-[#15803D]" size={84} strokeWidth={1.4} />
                </div>
                <div className="mt-6 space-y-3">
                  {['Signed by an issuer', 'Review the destination', 'You decide to open'].map((label) => (
                    <div key={label} className="flex items-center gap-2 text-sm text-slate-100"><Check size={16} className="text-green-300" />{label}</div>
                  ))}
                </div>
                <p className="mt-5 text-xs text-slate-300">Product preview · Verification not active</p>
              </div>
            </div>
          </section>
        ) : (
          <section aria-live="polite" className="mx-auto mt-12 max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:mt-20 sm:p-12">
            <div className="mb-6 inline-flex rounded-2xl bg-green-50 p-4 text-[#15803D]"><ShieldCheck size={30} aria-hidden="true" /></div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#15803D]">Not yet implemented</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">{placeholderContent[screen].heading}</h1>
            <p className="mt-4 leading-7 text-slate-600">{placeholderContent[screen].body}</p>
            <button className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#101C34] px-5 py-3 font-semibold text-white hover:bg-slate-800" onClick={() => setScreen('home')}><ArrowLeft size={18} aria-hidden="true" /> Back to home</button>
          </section>
        )}
      </main>
      <footer className="mx-auto flex max-w-6xl flex-col gap-2 px-5 pb-8 text-xs text-slate-500 sm:flex-row sm:justify-between sm:px-8"><span>TrueSeal · Know before you open.</span><span>Prototype foundation · CP01</span></footer>
    </div>
  )
}
