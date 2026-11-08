import { beforeEach, describe, expect, it, vi } from 'vitest'
import QrScanner from 'qr-scanner'
import { decodeQRImage } from './qr'

vi.mock('qr-scanner', () => ({
  default: { scanImage: vi.fn() },
}))
beforeEach(() => vi.mocked(QrScanner.scanImage).mockReset())

describe('CP03 Nimiq upload decoding integration', () => {
  it('decodes an image via the approved Nimiq scanner', async () => {
    vi.mocked(QrScanner.scanImage).mockResolvedValue('https://example.edu')
    const file = new File(['image bytes'], 'qr.png', { type: 'image/png' })
    await expect(decodeQRImage(file)).resolves.toBe('https://example.edu')
    expect(QrScanner.scanImage).toHaveBeenCalledWith(file, { returnDetailedScanResult: true })
  })

  it('reports unreadable QR images without leaking scanner errors', async () => {
    vi.mocked(QrScanner.scanImage).mockImplementationOnce(async () => { throw new Error('scanner internal detail') })
    await expect(decodeQRImage(new File(['image'], 'bad.png', { type: 'image/png' })))
      .rejects.toThrow('No readable QR code')
  })

  it('rejects non-image uploads before invoking image decoding', async () => {
    await expect(decodeQRImage(new File(['bad'], 'bad.txt', { type: 'text/plain' })))
      .rejects.toThrow('Choose a PNG')
    expect(QrScanner.scanImage).not.toHaveBeenCalled()
  })
})
