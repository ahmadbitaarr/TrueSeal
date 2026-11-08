/* eslint-disable no-undef */
// Local demo fixture only. Does not provision or store a trusted signing key.
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import QRCode from 'qrcode'
import { generateKeyPair, SignJWT } from 'jose'

const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' })
const token = await new SignJWT({
  iss: 'cp03-ephemeral-demo',
  aud: 'trueseal-qr',
  jti: 'cp03-phone-check',
  iat: 1_700_000_000,
  exp: 1_900_000_000,
  dst: `https://events.vt.edu/example?ticket=${'q'.repeat(150)}`,
  v: 1,
}).setProtectedHeader({ alg: 'EdDSA', typ: 'trueseal+jwt', kid: 'not-a-trusted-demo-key' }).sign(privateKey)

const signedUrl = `https://trueseal-431.pages.dev/v/${token}`
const path = join(tmpdir(), 'trueseal-cp03-sample.png')
await QRCode.toFile(path, signedUrl, { errorCorrectionLevel: 'M', margin: 4, width: 768 })
console.log(`Created local test PNG: ${path}`)
console.log(`Signed demo URL length: ${signedUrl.length} characters`)
console.log('IMPORTANT: The QR token uses a throwaway key, is NOT trusted, and must show UNVERIFIED in CP03.')
