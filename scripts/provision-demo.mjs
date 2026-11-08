/* global console, process */
/** HUMAN-RUN ONLY. Generates ephemeral local or separately provisioned production credentials.
 * This script NEVER calls Cloudflare or GitHub. It writes ignored, private local files.
 */
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const mode = process.argv[2]
if (mode !== '--local' && mode !== '--production') {
  console.error('Usage: node scripts/provision-demo.mjs --local | --production')
  process.exit(2)
}
const production = mode === '--production'
const base = '.local'
mkdirSync(base, { recursive: true, mode: 0o700 })
const prefix = production ? 'production' : 'local'
const secretFile = production ? join(base, `${prefix}-secrets.txt`) : '.dev.vars'
const accessFile = join(base, `${prefix}-access-key.txt`)
const seedFile = join(base, `${prefix}-demo-seed.sql`)
const publicFile = join(base, `${prefix}-public-jwk.json`)
const targetFiles = [secretFile, accessFile, seedFile, publicFile]
if (targetFiles.some(existsSync)) {
  console.error('Provisioning files already exist. Refusing to overwrite or rotate signing credentials.')
  process.exit(1)
}
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const publicJwk = publicKey.export({ format: 'jwk' })
const privateJwk = privateKey.export({ format: 'jwk' })
const accessKey = randomBytes(32).toString('base64url')
const accessHash = createHash('sha256').update(accessKey).digest('hex')
const throttleSecret = randomBytes(32).toString('base64url')
const origin = 'https://trueseal-431.pages.dev'
const data = [
  `TRUSEAL_ACCESS_KEY_SHA256=${accessHash}`,
  `TRUSEAL_THROTTLE_SECRET=${throttleSecret}`,
  `TRUSEAL_SIGNING_PRIVATE_JWK=${JSON.stringify(privateJwk)}`,
  `TRUSEAL_PUBLIC_ORIGIN=${origin}`,
  'TRUSEAL_SIGNING_KID=trueseal-demo-ed25519-v1',
].join('\n') + '\n'

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
const now = Math.floor(Date.now() / 1000)
const seed = [
  '-- Public-only registry seed. Never put private JWK or access keys in SQL.',
  `INSERT INTO issuers (id, display_name, trust_tier, status, created_at) VALUES ('trueseal-demo', 'TrueSeal Demo Organization', 'demo', 'active', ${now}) ON CONFLICT(id) DO NOTHING;`,
  `INSERT INTO issuer_keys (kid, issuer_id, public_jwk, status, created_at) VALUES ('trueseal-demo-ed25519-v1', 'trueseal-demo', ${quote(JSON.stringify(publicJwk))}, 'active', ${now}) ON CONFLICT(kid) DO NOTHING;`,
  `INSERT INTO issuer_allowed_hosts (issuer_id, hostname) VALUES ('trueseal-demo', 'trueseal-431.pages.dev') ON CONFLICT(issuer_id, hostname) DO NOTHING;`,
  'SELECT i.id, i.display_name, i.trust_tier, i.status, k.kid, k.status AS key_status, h.hostname FROM issuers i JOIN issuer_keys k ON k.issuer_id = i.id JOIN issuer_allowed_hosts h ON h.issuer_id = i.id WHERE i.id = \'trueseal-demo\';',
].join('\n') + '\n'
// Exclusive create prevents inadvertent rotation or plaintext overwrites.
for (const [filename, content] of [
  [secretFile, data], [accessFile, accessKey + '\n'], [seedFile, seed],
  [publicFile, JSON.stringify(publicJwk, null, 2) + '\n'],
]) writeFileSync(filename, content, { flag: 'wx', mode: 0o600 })
console.log(`Created four ignored ${prefix} provisioning files. No credentials were printed.`)
console.log(`Public registry seed: ${seedFile}`)
console.log('Compare the registered public JWK to the generated public JWK before enabling issuance.')
