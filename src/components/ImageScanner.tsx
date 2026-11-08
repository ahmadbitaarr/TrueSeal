import { useEffect, useRef, useState } from 'react'
import { ImageUp } from 'lucide-react'
import { decodeQRImage } from '../lib/qr'

interface ImageScannerProps {
  onDecoded: (content: string) => void
}

export default function ImageScanner({ onDecoded }: ImageScannerProps) {
  const sequenceRef = useRef(0)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => { sequenceRef.current += 1 }, [])

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) return
    const sequence = ++sequenceRef.current
    setError('')
    setWorking(true)

    try {
      const content = await decodeQRImage(file)
      if (sequence === sequenceRef.current) onDecoded(content)
    } catch (e) {
      if (sequence === sequenceRef.current) {
        setError(e instanceof Error ? e.message : 'Unable to read that image.')
      }
    } finally {
      if (sequence === sequenceRef.current) setWorking(false)
    }
  }

  return (
    <div className="mt-6 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 sm:p-7">
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        <ImageUp size={30} className="text-[#15803D]" aria-hidden="true" />
        <p className="font-semibold">Select a QR screenshot or photo</p>
        <p className="text-sm text-slate-500">PNG, JPG, WebP, GIF, or BMP · up to 15 MB</p>
      </div>
      <label htmlFor="qr-file" className="block text-sm font-semibold">Choose image</label>
      <input
        id="qr-file"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        aria-label="Choose image"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = '' // Allow choosing the same file again.
          void handleFile(file)
        }}
        className="mt-2 block w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-2 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-[#101C34] file:px-3 file:py-2 file:text-white"
      />
      <p className="mt-3 text-xs text-slate-500">Images are decoded locally; no image is uploaded to a server.</p>
      {working && <p aria-live="polite" className="mt-3 text-sm">Reading image…</p>}
      {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>}
    </div>
  )
}
