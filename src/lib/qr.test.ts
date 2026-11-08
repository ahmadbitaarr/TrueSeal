// @vitest-environment node
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import jsQR from 'jsqr'
import { generateKeyPair } from 'jose'
import { signQrToken } from '../../functions/_lib/crypto'
import { generateQRCode, MAX_PRACTICAL_QR_BYTES, QR_IMAGE_WIDTH, validateImageFile } from './qr'

async function decodeGeneratedPng(value: string) {
  const url = await generateQRCode(value)
  expect(url.startsWith('data:image/png;base64,')).toBe(true)
  const png = PNG.sync.read(Buffer.from(url.split(',')[1], 'base64'))
  expect(png.width).toBe(QR_IMAGE_WIDTH)
  expect(png.height).toBe(QR_IMAGE_WIDTH)
  // Assert the white outer quiet zone exists.
  const pixel = (x: number, y: number) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3)]
  expect(pixel(0, 0)).toEqual([255, 255, 255])
  expect(pixel(12, 12)).toEqual([255, 255, 255])
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  expect(decoded?.data).toBe(value)
}

describe('CP03 QR image generation and round-trip decoding', () => {
  it('generates a correctly sized PNG that another QR decoder reads', async () => {
    await decodeGeneratedPng('https://trueseal-431.pages.dev/v/abc.def.signature')
  })

  it('round-trips a real Ed25519-signed verification URL', async () => {
    const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519' })
    const token = await signQrToken({
      iss: 'demo-issuer',
      aud: 'trueseal-qr',
      jti: 'cp03-test-001',
      iat: 1_700_000_000,
      exp: 1_900_000_000,
      dst: `https://events.vt.edu/event?ticket=${'a'.repeat(160)}`,
      v: 1,
    }, 'demo-issuer:key-1', pair.privateKey)
    await decodeGeneratedPng(`https://trueseal-431.pages.dev/v/${token}`)
  })

  it('rejects empty input', async () => {
    await expect(generateQRCode('   ')).rejects.toThrow('required')
  })

  it('rejects impractically dense QR values with a useful message', async () => {
    await expect(generateQRCode('a'.repeat(MAX_PRACTICAL_QR_BYTES + 1)))
      .rejects.toThrow('too long')
  })

  it('rejects invalid, empty, and oversized image uploads', () => {
    expect(() => validateImageFile(new File(['abc'], 'payload.txt', { type: 'text/plain' }))).toThrow('PNG')
    expect(() => validateImageFile(new File([], 'empty.png', { type: 'image/png' }))).toThrow('empty')
    const bigFile = new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    expect(() => validateImageFile(bigFile)).toThrow('smaller')
  })
})
