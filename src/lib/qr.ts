import QRCode from 'qrcode'
import { BrowserQRCodeReader } from '@zxing/browser'

export async function generateQRCode(value: string): Promise<string> {
  const content = value.trim()

  if (!content) {
    throw new Error('Enter text or a URL first.')
  }

  return QRCode.toDataURL(content, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 280,
  })
}

export async function decodeQRImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file.')
  }

  const reader = new BrowserQRCodeReader()
  const imageUrl = URL.createObjectURL(file)

  try {
    const result = await reader.decodeFromImageUrl(imageUrl)
    return result.getText()
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}