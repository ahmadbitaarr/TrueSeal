import { useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'
import { Camera, CameraOff, X } from 'lucide-react'

type CameraState = 'idle' | 'requesting' | 'scanning' | 'denied' | 'unavailable' | 'error'

interface CameraScannerProps {
  onDecoded: (content: string) => void
  onUploadFallback: () => void
}

function cameraErrorState(error: unknown): { state: CameraState; text: string } {
  const e = error as { name?: string } | null
  if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError' || e?.name === 'SecurityError') {
    return { state: 'denied', text: 'Camera permission was denied. Allow access in browser settings, or upload a QR image instead.' }
  }
  if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError' || e?.name === 'NotReadableError' || e?.name === 'OverconstrainedError' || e?.name === 'NotSupportedError') {
    return { state: 'unavailable', text: 'No usable camera was found. Try image upload instead.' }
  }
  return { state: 'error', text: 'Camera could not start. Check permissions, close other camera apps, or upload an image.' }
}

export default function CameraScanner({ onDecoded, onUploadFallback }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const sequenceRef = useRef(0)
  const [state, setState] = useState<CameraState>('idle')
  const [message, setMessage] = useState('')

  function releaseCamera(): void {
    const scanner = scannerRef.current
    scannerRef.current = null
    if (scanner) {
      // Prefer immediate stream-track release when leaving the camera view.
      void scanner.pause(true).catch(() => {})
      scanner.stop()
      scanner.destroy()
    }
  }

  // The sequence invalidates in-flight start() and onDecode callbacks.
  useEffect(() => {
    return () => {
      sequenceRef.current += 1
      releaseCamera()
    }
  }, [])

  function stopCamera(): void {
    sequenceRef.current += 1
    releaseCamera()
    setState('idle')
    setMessage('')
  }

  async function startCamera(): Promise<void> {
    const video = videoRef.current
    if (!video) return

    const sequence = ++sequenceRef.current
    releaseCamera()
    setMessage('')
    setState('requesting')

    let scanner: QrScanner | null = null
    try {
      scanner = new QrScanner(
        video,
        (result) => {
          if (sequenceRef.current !== sequence || scannerRef.current !== scanner) return
          sequenceRef.current += 1
          releaseCamera()
          const data = typeof result === 'string' ? result : result.data
          if (data) onDecoded(data)
        },
        {
          preferredCamera: 'environment',
          returnDetailedScanResult: true,
          highlightScanRegion: true,
          highlightCodeOutline: true,
        },
      )
      scannerRef.current = scanner
      await scanner.start()
      if (sequenceRef.current !== sequence || scannerRef.current !== scanner) {
        scanner.stop()
        scanner.destroy()
        return
      }
      setState('scanning')
    } catch (error) {
      // An outdated permission prompt must not show an error or restart the camera.
      if (sequenceRef.current !== sequence) {
        if (scannerRef.current === scanner) releaseCamera()
        return
      }
      releaseCamera()
      const failure = cameraErrorState(error)
      setState(failure.state)
      setMessage(failure.text)
    }
  }

  const active = state === 'requesting' || state === 'scanning'

  return (
    <div>
      <div className="mt-6 overflow-hidden rounded-xl bg-slate-900">
        <video
          ref={videoRef}
          className="aspect-[4/3] w-full object-cover"
          aria-label="Camera preview"
          playsInline
          muted
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {!active ? (
          <button
            type="button"
            onClick={() => void startCamera()}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#15803D] px-5 py-3 font-semibold text-white hover:bg-[#11652F]"
          >
            <Camera size={18} aria-hidden="true" /> Start Camera
          </button>
        ) : (
          <button
            type="button"
            onClick={stopCamera}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#101C34] px-5 py-3 font-semibold text-white"
          >
            <X size={18} aria-hidden="true" /> Cancel Camera
          </button>
        )}
        <button
          type="button"
          onClick={() => { stopCamera(); onUploadFallback() }}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-[#101C34]"
        >
          <CameraOff size={18} aria-hidden="true" /> Upload an image instead
        </button>
      </div>
      <p aria-live="polite" className="mt-3 text-sm text-slate-600">
        {state === 'requesting' ? 'Requesting camera access…' : state === 'scanning' ? 'Scanning for a QR code…' : state === 'idle' ? 'Camera is off. Tap Start Camera to begin.' : ''}
      </p>
      {message && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{message}</p>}
    </div>
  )
}
