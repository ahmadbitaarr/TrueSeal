// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { expirationDays, parseDestination, parseTitle, publicOrigin } from './destinations'

describe('CP06 destination, title and expiration policy', () => {
  it.each([
    'http://trueseal-431.pages.dev/',
    'javascript:alert(1)',
    'data:text/html,hello',
    'https://user:password@trueseal-431.pages.dev/',
    'https://127.0.0.1/',
    'https://[::1]/',
    'https://localhost/',
    'https://x.localhost/',
    'https://trueseal-431.pages.dev:8443/',
    'https://trueseal-431.pages.dev./',
    'https://trueseal-431.pages.dev\\@attacker.test/',
    'https://trueseal-431.pages.dev/\r\n',
    '',
    '  https://trueseal-431.pages.dev/',
    'https://trueseal-431.pages.dev/' + 'a'.repeat(250),
  ])('rejects unsafe URL %s', (value) => expect(() => parseDestination(value)).toThrow())
  it('extracts normalized exact host while keeping the signed destination', () => {
    expect(parseDestination('https://TRUESEAL-431.pages.dev/hello?q=1'))
      .toEqual({ destination: 'https://TRUESEAL-431.pages.dev/hello?q=1', hostname: 'trueseal-431.pages.dev' })
  })
  it('does not collapse a deceptive suffix, lookalike or subdomain into an allowed host', () => {
    const hosts = [
      'https://trueseal-431.pages.dev.attacker.test/',
      'https://badtrueseal-431.pages.dev/',
      'https://trueseal-431.pages.devv/',
    ].map((value) => parseDestination(value).hostname)
    expect(hosts.every((host) => host !== 'trueseal-431.pages.dev')).toBe(true)
  })
  it('limits title and expiration presets', () => {
    expect(parseTitle('Official demonstration')).toBe('Official demonstration')
    expect(() => parseTitle('a'.repeat(65))).toThrow()
    expect(() => parseTitle('  ')).toThrow()
    expect(expirationDays(undefined)).toBe(7)
    expect([1, 7, 30].map(expirationDays)).toEqual([1, 7, 30])
    expect(() => expirationDays(365)).toThrow()
    expect(() => expirationDays('7')).toThrow()
  })
  it('rejects untrusted or malformed public origins', () => {
    expect(publicOrigin('https://trueseal-431.pages.dev')).toBe('https://trueseal-431.pages.dev')
    expect(() => publicOrigin('http://trueseal-431.pages.dev')).toThrow()
    expect(() => publicOrigin('https://trueseal-431.pages.dev/path')).toThrow()
    expect(() => publicOrigin(undefined)).toThrow()
  })
})
