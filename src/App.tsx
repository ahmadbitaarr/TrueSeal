
import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ImageUp,
  LockKeyhole,
  QrCode,
  ShieldCheck,
  X,
} from 'lucide-react'
import { BrowserQRCodeReader } from '@zxing/browser'
import { generateQRCode, decodeQRImage } from './lib/qr'

type Screen = 'home' | 'scan' | 'upload' | 'organizations' | 'generate'

const placeholderContent: Record<
  'organizations',
  { heading: string; body: string }
> = {
  organizations: {
    heading: 'Organization access is coming soon',
    body: 'Issuer sign-in and signed QR issuance will be added in later checkpoints. There is no active organization portal yet.',
  },
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [qrText, setQrText] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [qrError, setQrError] = useState('')
  const [scanResult, setScanResult] = useState('')
  const [scanError, setScanError] = useState('')
  const [cameraActive, setCameraActive] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  useEffect(() => {
    return () => {
      controlsRef.current?.stop()
    }
  }, [])

  async function handleGenerate() {
    setQrError('')
    setQrImage('')

    try {
      setQrImage(await generateQRCode(qrText))
    } catch (error) {
      setQrError(
        error instanceof Error ? error.message : 'QR generation failed.',
      )
    }
  }

  async function handleImageUpload(file?: File) {
    if (!file) return

    setScanError('')
    setScanResult('')

    try {
      setScanResult(await decodeQRImage(file))
    } catch {
      setScanError('No readable QR code was found in that image.')
    }
  }

  async function startCamera() {
    setScanError('')
    setScanResult('')
    setCameraActive(true)

    try {
      const reader = new BrowserQRCodeReader()
      const devices = await BrowserQRCodeReader.listVideoInputDevices()

      if (!devices.length) {
        throw new Error('No camera was found.')
      }

      const controls = await reader.decodeFromVideoDevice(
        devices[0].deviceId,
        videoRef.current!,
        (result, error) => {
          if (result) {
            setScanResult(result.getText())
            controlsRef.current?.stop()
            controlsRef.current = null
            setCameraActive(false)
          }

          if (error && error.name !== 'NotFoundException') {
            setScanError('Unable to read the QR code. Try again.')
          }
        },
      )

      controlsRef.current = controls
    } catch {
      setCameraActive(false)
      setScanError(
        'Camera access failed. Check your browser permissions and try again.',
      )
    }
  }

  function stopCamera() {
    controlsRef.current?.stop()
    controlsRef.current = null
    setCameraActive(false)
  }

  function goHome() {
    stopCamera()
    setScreen('home')
    setScanResult('')
    setScanError('')
    setQrError('')
    setQrImage('')
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#101C34]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8 sm:py-8">
        <button
          aria-label="TrueSeal home"
          className="flex items-center gap-2.5 rounded-md text-left"
          onClick={goHome}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#101C34] text-white">
            <ShieldCheck size={24} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="text-xl font-bold tracking-tight">TrueSeal</span>
        </button>

        <button
          onClick={() => setScreen('organizations')}
          className="rounded-lg px-2 py-2 text-sm font-semibold text-[#35435A] transition hover:text-[#15803D] sm:px-4"
        >
          For organizations <ArrowRight className="ml-1 inline" size={15} aria-hidden="true" />
        </button>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
        {screen === 'home' ? (
          <section className="relative mx-auto mt-8 grid max-w-5xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_90px_-55px_rgba(16,28,52,0.4)] md:mt-14 md:grid-cols-[1.14fr_0.86fr]">
            <div className="px-6 py-12 sm:px-12 sm:py-16 lg:px-16 lg:py-20">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-[#15803D]">
                <ShieldCheck size={15} aria-hidden="true" />
                Built for safer QR decisions
              </div>

              <h1 className="max-w-lg text-[clamp(2.45rem,5vw,4.25rem)] font-bold leading-[1.08] tracking-[-0.045em]">
                Scan with confidence.
              </h1>

              <p className="mt-5 max-w-md text-base leading-7 text-slate-600 sm:text-lg">
                Check who signed a QR code and where it leads.
              </p>

              <div className="mt-9 flex max-w-sm flex-col gap-3">
                <button
                  className="flex min-h-13 w-full items-center justify-center gap-3 rounded-xl bg-[#15803D] px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-[#11652F]"
                  onClick={() => setScreen('scan')}
                >
                  <Camera size={20} aria-hidden="true" />
                  Scan QR Code
                  <ArrowRight className="ml-auto" size={18} aria-hidden="true" />
                </button>

                <button
                  className="flex min-h-13 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-[#101C34] transition hover:bg-slate-50"
                  onClick={() => setScreen('upload')}
                >
                  <ImageUp size={20} aria-hidden="true" />
                  Upload QR Image
                  <ArrowRight className="ml-auto" size={18} aria-hidden="true" />
                </button>

                <button
                  className="flex min-h-13 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-[#101C34] transition hover:bg-slate-50"
                  onClick={() => setScreen('generate')}
                >
                  <QrCode size={20} aria-hidden="true" />
                  Generate QR Code
                  <ArrowRight className="ml-auto" size={18} aria-hidden="true" />
                </button>
              </div>

              <p className="mt-5 flex items-start gap-2 text-sm leading-6 text-slate-500">
                <LockKeyhole className="mt-1 shrink-0" size={14} aria-hidden="true" />
                No account required. Links never open automatically.
              </p>
            </div>

            <div
              aria-hidden="true"
              className="relative hidden min-h-[440px] items-center justify-center overflow-hidden bg-[#101C34] md:flex"
            >
              <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/10" />
              <div className="absolute -left-28 -bottom-28 h-72 w-72 rounded-full border border-white/10" />

              <div className="relative w-64 rounded-3xl border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur-sm">
                <div className="mb-6 flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">A better way to scan</span>
                  <ShieldCheck className="text-green-300" size={21} />
                </div>

                <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-2xl bg-white/95">
                  <QrCode className="text-[#15803D]" size={100} strokeWidth={1.4} />
                </div>

                <div className="mt-6 space-y-3">
                  {['Scan a QR code', 'Review its destination', 'You decide to open'].map((label) => (
                    <div key={label} className="flex items-center gap-2 text-sm text-slate-100">
                      <Check size={16} className="text-green-300" />
                      {label}
                    </div>
                  ))}
                </div>

                <p className="mt-5 text-xs text-slate-300">
                  Product preview · Verification not active
                </p>
              </div>
            </div>
          </section>
        ) : screen === 'generate' ? (
          <section className="mx-auto mt-12 max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-3xl font-bold">Generate a QR Code</h1>
            <p className="mt-3 text-slate-600">
              Enter text or a URL to create a QR code.
            </p>

            <label htmlFor="qr-text" className="mt-6 block font-semibold">
              Text or URL
            </label>
            <textarea
              id="qr-text"
              value={qrText}
              onChange={(event) => setQrText(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 p-3"
              rows={3}
              placeholder="https://example.com"
            />

            <button
              className="mt-4 rounded-xl bg-[#15803D] px-5 py-3 font-semibold text-white hover:bg-[#11652F]"
              onClick={handleGenerate}
            >
              Generate
            </button>

            {qrError && (
              <p role="alert" className="mt-4 text-red-600">{qrError}</p>
            )}

            {qrImage && (
              <div className="mt-6 text-center">
                <img src={qrImage} alt="Generated QR code" className="mx-auto" />
                <a
                  href={qrImage}
                  download="trueseal-qr.png"
                  className="mt-4 inline-block font-semibold text-green-700 underline"
                >
                  Download QR Code
                </a>
              </div>
            )}

            <button className="mt-8 block font-semibold text-slate-600" onClick={goHome}>
              <ArrowLeft className="mr-1 inline" size={17} /> Back to home
            </button>
          </section>
        ) : screen === 'scan' ? (
          <section className="mx-auto mt-12 max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-3xl font-bold">Scan a QR Code</h1>
            <p className="mt-3 text-slate-600">
              Use your camera to scan a QR code. Scanned links will not open automatically.
            </p>

            <video
              ref={videoRef}
              className="mt-6 w-full rounded-xl bg-slate-900"
              aria-label="Camera preview"
              muted
              playsInline
            />

            {!cameraActive ? (
              <button
                onClick={startCamera}
                className="mt-4 rounded-xl bg-[#15803D] px-5 py-3 font-semibold text-white"
              >
                <Camera className="mr-2 inline" size={18} />
                Start Camera
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="mt-4 rounded-xl bg-red-600 px-5 py-3 font-semibold text-white"
              >
                <X className="mr-2 inline" size={18} />
                Stop Camera
              </button>
            )}

            {scanError && <p role="alert" className="mt-4 text-red-600">{scanError}</p>}

            {scanResult && <ScanResult value={scanResult} />}

            <button className="mt-8 block font-semibold text-slate-600" onClick={goHome}>
              <ArrowLeft className="mr-1 inline" size={17} /> Back to home
            </button>
          </section>
        ) : screen === 'upload' ? (
          <section className="mx-auto mt-12 max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-3xl font-bold">Upload a QR Image</h1>
            <p className="mt-3 text-slate-600">
              Select an image containing a QR code. It is decoded locally in your browser.
            </p>

            <div className="mt-8 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-6 transition hover:border-indigo-400">
              <div className="mb-5 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                  <ImageUp size={28} aria-hidden="true" />
                </div>
                <p className="text-lg font-semibold text-slate-800">
                  Upload your QR code
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Choose a PNG, JPG, or other image containing a QR code.
                </p>
              </div>

              <label htmlFor="qr-file" className="sr-only">
                Choose image
              </label>
              <input
                id="qr-file"
                type="file"
                accept="image/*"
                aria-label="Choose image"
                onChange={(event) => handleImageUpload(event.target.files?.[0])}
                className="block w-full cursor-pointer rounded-xl border border-slate-200 bg-white text-sm text-slate-600 file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-indigo-600 file:px-5 file:py-3 file:font-semibold file:text-white hover:file:bg-indigo-700"
              />
              <p className="mt-3 text-center text-xs text-slate-400">
                Your image is processed locally in your browser.
              </p>
            </div>

            {scanError && <p role="alert" className="mt-4 text-red-600">{scanError}</p>}

            {scanResult && <ScanResult value={scanResult} />}

            <button className="mt-8 block font-semibold text-slate-600" onClick={goHome}>
              <ArrowLeft className="mr-1 inline" size={17} /> Back to home
            </button>
          </section>
        ) : (
          <section aria-live="polite" className="mx-auto mt-12 max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:mt-20 sm:p-12">
            <div className="mb-6 inline-flex rounded-2xl bg-green-50 p-4 text-[#15803D]">
              <ShieldCheck size={30} aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[#15803D]">
              Not yet implemented
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">
              {placeholderContent.organizations.heading}
            </h1>
            <p className="mt-4 leading-7 text-slate-600">
              {placeholderContent.organizations.body}
            </p>
            <button
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#101C34] px-5 py-3 font-semibold text-white hover:bg-slate-800"
              onClick={goHome}
            >
              <ArrowLeft size={18} aria-hidden="true" /> Back to home
            </button>
          </section>
        )}
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-2 px-5 pb-8 text-xs text-slate-500 sm:flex-row sm:justify-between sm:px-8">
        <span>TrueSeal · Know before you open.</span>
        <span>QR generation and scanning · CP03</span>
      </footer>
    </div>
  )
}

function ScanResult({ value }: { value: string }) {
  const isUrl = /^https?:\/\//i.test(value)

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-live="polite">
      <h2 className="font-bold">QR content detected</h2>
      <p className="mt-2 break-all text-sm text-slate-700">{value}</p>
      {isUrl && (
        <p className="mt-3 text-sm font-medium text-amber-700">
          Review this destination carefully before opening it. TrueSeal has not verified it.
        </p>
      )}
    </div>
  )
}
