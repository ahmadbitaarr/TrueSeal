/* global console, process, fetch, TextDecoder */
/** Human-run LOCAL Pages + D1 end-to-end test (no remote Cloudflare writes).
 * Requires a migrated + seeded local D1, .dev.vars and running `npm run dev:edge`.
 * Never prints or persists raw credentials, sessions or signed tokens.
 */
import { readFileSync } from 'node:fs'
import { compactVerify, importJWK } from 'jose'
import QRCode from 'qrcode'
import { PNG } from 'pngjs'
import jsQR from 'jsqr'
import { Buffer } from 'node:buffer'

const localOrigin = 'http://127.0.0.1:8788'
const accessKey = readFileSync('.local/local-access-key.txt', 'utf8').trim()
const publicJwk = JSON.parse(readFileSync('.local/local-public-jwk.json', 'utf8'))
const expectedDestination = 'https://trueseal-431.pages.dev/demo'
const errors = []
let checks = 0
const assert = (condition, name) => {
  checks++
  if (!condition) errors.push(name)
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`)
}
async function call(path, method = 'GET', body, cookie, origin = localOrigin) {
  const response = await fetch(localOrigin + path, {
    method,
    headers: {
      Origin: origin,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
  const payload = response.status === 204 ? null : await response.json()
  return { response, payload }
}
try {
  const health = await call('/api/health')
  assert(health.response.status === 200 && health.payload?.database === 'connected', 'local Pages and D1 health')
  const noAuth = await call('/api/issuer/codes', 'POST', { title: 'Unauthorized', destinationUrl: expectedDestination })
  assert(noAuth.response.status === 401, 'unauthenticated issuance rejected')
  const wrong = await call('/api/auth/login', 'POST', { accessKey: 'INVALID-LOCAL-TEST-CREDENTIAL' })
  assert(wrong.response.status === 401, 'invalid access key rejected')
  const crossSite = await call('/api/auth/login', 'POST', { accessKey }, undefined, 'https://attacker.example')
  assert(crossSite.response.status === 403, 'cross-origin login rejected')
  const signedIn = await call('/api/auth/login', 'POST', { accessKey })
  assert(signedIn.response.status === 200, 'valid access key creates session')
  const setCookie = signedIn.response.headers.get('set-cookie') ?? ''
  assert(['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=14400'].every((part) => setCookie.includes(part)), 'secure cookie attributes')
  const cookie = setCookie.split(';')[0]
  const current = await call('/api/auth/session', 'GET', undefined, cookie)
  assert(current.response.status === 200 && current.payload?.issuer?.issuerId === 'trueseal-demo', 'authenticated demo issuer resolved')
  const forged = await call('/api/auth/session', 'GET', undefined, '__Host-trueseal-session=' + 'f'.repeat(64))
  assert(forged.response.status === 401, 'forged session rejected')
  const attack = await call('/api/issuer/codes', 'POST', { title: 'Attack', destinationUrl: 'https://trueseal-431.pages.dev.attacker.test/' }, cookie)
  assert([400, 403].includes(attack.response.status), 'deceptive destination rejected')
  const override = await call('/api/issuer/codes', 'POST', { title: 'Attack', destinationUrl: expectedDestination, issuerId: 'unregistered' }, cookie)
  assert(override.response.status === 400, 'issuer impersonation field rejected')
  const issued = await call('/api/issuer/codes', 'POST', { title: 'Milestone A demonstration', destinationUrl: expectedDestination, expirationDays: 7 }, cookie)
  assert(issued.response.status === 201, 'authenticated issuance persisted')
  const code = issued.payload?.code
  if (code) {
    const key = await importJWK(publicJwk, 'EdDSA')
    const verified = await compactVerify(code.signedToken, key, { algorithms: ['EdDSA'] })
    const claims = JSON.parse(new TextDecoder().decode(verified.payload))
    assert(verified.protectedHeader.alg === 'EdDSA' && verified.protectedHeader.typ === 'trueseal+jwt' && verified.protectedHeader.kid === 'trueseal-demo-ed25519-v1', 'signed header uses registered key')
    assert(claims.iss === 'trueseal-demo' && claims.aud === 'trueseal-qr' && claims.dst === expectedDestination && claims.jti === code.jti && claims.v === 1, 'signed claims match issuer and destination')
    assert(code.verificationUrl === 'https://trueseal-431.pages.dev/v/' + code.signedToken, 'signed verification URL constructed from configured origin')
    const data = await QRCode.toDataURL(code.verificationUrl, { margin: 4, width: 768, errorCorrectionLevel: 'M' })
    const png = PNG.sync.read(Buffer.from(data.split(',')[1], 'base64'))
    assert(png.width >= 512 && jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data === code.verificationUrl, 'signed QR image round trips')
    const listed = await call('/api/issuer/codes', 'GET', undefined, cookie)
    assert(listed.response.status === 200 && listed.payload?.codes?.some((item) => item.signedToken === code.signedToken), 'stored token matches protected listing')
    const detail = await call(`/api/issuer/codes/${code.jti}`, 'GET', undefined, cookie)
    assert(detail.response.status === 200 && detail.payload?.code?.signedToken === code.signedToken, 'protected issuer-scoped detail matches')
  } else { errors.push('issuance returned no code') }
  const signOut = await call('/api/auth/logout', 'POST', undefined, cookie)
  assert(signOut.response.status === 204 && (signOut.response.headers.get('set-cookie') ?? '').includes('Max-Age=0'), 'logout invalidates session and cookie')
  const afterLogout = await call('/api/auth/session', 'GET', undefined, cookie)
  assert(afterLogout.response.status === 401, 'logged-out session cannot access issuer')
  for (let i = 0; i < 5; i++) await call('/api/auth/login', 'POST', { accessKey: 'wrong-' + i })
  const limited = await call('/api/auth/login', 'POST', { accessKey: 'wrong-last' })
  assert(limited.response.status === 429, 'D1-backed rate limiting activates')
} catch (error) {
  errors.push('Runtime or network failure: ' + (error instanceof Error ? error.message : 'unknown'))
}
console.log(`Milestone A local smoke: ${checks - errors.filter((name) => !name.startsWith('Runtime')).length}/${checks} checks passed`)
if (errors.length) {
  console.error('FAILED CHECKS:', errors.join('; '))
  process.exitCode = 1
}
