import QRCode from 'qrcode'
import QrScanner from 'qr-scanner'

const MAX_IMAGE_BYTES = 15 * 1024 * 1024
// This is a usability ceiling, not QR's theoretical byte-mode maximum.
// Very dense signed-token QR codes become difficult for phone cameras to scan.
export const MAX_PRACTICAL_QR_BYTES = 1200
export const QR_IMAGE_WIDTH = 768

export async function generateQRCode(value: string): Promise<string> {
  const content = value.trim()
  if (!content) throw new Error('A signed verification URL is required.')

  if (new TextEncoder().encode(content).length > MAX_PRACTICAL_QR_BYTES) {
    throw new Error(
      'This signed verification URL is too long for a reliably readable QR code. Short-reference URLs require protocol approval.',
    )
  }

  try {
    return await QRCode.toDataURL(content, {
      type: 'image/png',
      errorCorrectionLevel: 'M',
      margin: 4,
      width: QR_IMAGE_WIDTH,
    })
  } catch {
    throw new Error('Could not generate a QR image for this value.')
  }
}

export function validateImageFile(file: File): void {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].includes(file.type)) {
    throw new Error('Choose a PNG, JPG, WebP, GIF, or BMP image.')
  }
  if (file.size === 0) throw new Error('The selected image is empty.')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Choose an image smaller than 15 MB.')
}

export async function decodeQRImage(file: File): Promise<string> {
  validateImageFile(file)
  try {
    const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true })
    const content = typeof result === 'string' ? result : result.data
    if (!content) throw new Error('Empty QR code.')
    return content
  } catch {
    throw new Error('No readable QR code was found in that image. Try a clearer screenshot or photo.')
  }
}
