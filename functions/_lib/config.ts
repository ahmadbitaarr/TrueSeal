export const DEMO_ISSUER_ID = 'trueseal-demo'
export const DEMO_KID = 'trueseal-demo-ed25519-v1'
export const DEMO_HOST = 'trueseal-431.pages.dev'
export const COOKIE_NAME = '__Host-trueseal-session'
export const SESSION_SECONDS = 4 * 60 * 60
export const LOGIN_WINDOW_SECONDS = 15 * 60
export const MAX_LOGIN_ATTEMPTS = 5

export interface IssuerEnv {
  DB?: D1Database
  // Secret values are configured only on the server; never use VITE_ names.
  TRUSEAL_ACCESS_KEY_SHA256?: string
  TRUSEAL_THROTTLE_SECRET?: string
  TRUSEAL_SIGNING_PRIVATE_JWK?: string
  TRUSEAL_PUBLIC_ORIGIN?: string
  TRUSEAL_SIGNING_KID?: string
}
