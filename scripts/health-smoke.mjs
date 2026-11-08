/* eslint-disable no-undef */
/**
 * Framework-free logical smoke tests for the CP01 endpoint. This does not replace
 * Vitest, local Cloudflare Pages/D1 integration tests, or public deployment tests.
 * Requires Node.js 22 with the --experimental-strip-types flag (works on TS source).
 */
import assert from 'node:assert/strict'
import { onRequestGet } from '../functions/api/health.ts'

const healthy = await onRequestGet({ env: { DB: { prepare(sql) {
  assert.equal(sql, 'SELECT 1 AS healthy')
  return { first: async () => ({ healthy: 1 }) }
} } } })
assert.equal(healthy.status, 200)
assert.deepEqual(await healthy.json(), { status: 'ok', application: 'ok', database: 'connected' })

const missing = await onRequestGet({ env: {} })
assert.equal(missing.status, 503)
assert.deepEqual(await missing.json(), { status: 'error', application: 'ok', database: 'unavailable' })

const failed = await onRequestGet({ env: { DB: { prepare: () => { throw Error('do not leak internal data') } } } })
assert.equal(failed.status, 503)
assert.doesNotMatch(await failed.text(), /do not leak internal data/)

console.log('health smoke: 3/3 PASS (mock D1 only; real D1 unverified)')
