# TrueSeal

TrueSeal is a mobile-first QR authenticity verifier built for KTP Hacks 2. A provisioned **TrueSeal Demo Organization** can issue real Ed25519-signed QR codes; students can scan with their phone camera, upload QR images, or open a `/v/<signed-token>` link to check the current issuance record, registered signing key, approved destination, expiration, and revocation state.

**This is a hackathon demonstration, not a Virginia Tech official verification service.** The configured demonstration issuer is explicitly labeled. Unknown or unsigned content is never treated as trusted. TrueSeal never opens scanned destinations automatically; the **Open Destination** action appears only for a currently `VERIFIED` code. Verification is not a guarantee that an external website is harmless.

## Stack

React + TypeScript + Vite, Tailwind CSS, Lucide, `qr-scanner`, `qrcode`, `jose` Ed25519/JWS, Cloudflare Pages Functions and D1. Node.js 22.

## Development

```sh
npm ci
npm run check
npm run dev:edge
```

The local Pages server runs at `http://127.0.0.1:8788`. The Vite-only `npm run dev` serves the frontend without Pages Functions. Configure local `.dev.vars` and the migrated, seeded local D1 database per `MILESTONE_A_HANDOFF.md`; do **not** commit keys or access credentials. `npm run dev:edge` uses local Cloudflare Pages Functions and D1.

Run the existing end-to-end flow, now extended to test real public verification:

```sh
node scripts/milestone-a-smoke.mjs
```

This requires ignored `.local/local-access-key.txt` and `.local/local-public-jwk.json` fixture files from the existing local provisioning process. No production credentials are required, and the script must only run against local Pages/D1.

## Public verification contract

`POST /api/verify` accepts JSON `{ "value": "<TrueSeal verification URL or compact JWS>" }`. A verification URL must have the exact configured HTTPS origin and a `/v/<token>` path; compact tokens are accepted to support the client-side direct-link route. The response has `status` and `message`. For `VERIFIED` only, it includes the registered issuer identity, signed destination, title and timestamps.

Statuses: `VERIFIED`, `UNKNOWN`, `INVALID`, `EXPIRED`, `REVOKED`, `CAUTION`, `UNAVAILABLE`. All responses set `Cache-Control: no-store`; a database/service failure returns HTTP 503 with `UNAVAILABLE`. A disabled issuer/key or withdrawn destination permission returns `CAUTION`. Revocation precedes expiration. No state or private data is leaked for nonverified statuses.

The verifier enforces the approved EdDSA/JWS protected header, signature against an independently registered Ed25519 key, signed claims, exact stored signed token and metadata, current issuer/key authorization, and current allowed host. It never uses token-provided URLs to retrieve keys.

## Demo flow

1. Open the homepage and select **For organizations**. Sign in with the authorized demonstration access key, configured server-side.
2. Choose a title, the approved demo destination (`https://trueseal-431.pages.dev/demo`), and expiration. Issue and download the real signed QR PNG.
3. On another device, scan the QR using TrueSeal or open its `/v/<token>` link directly. It must show `VERIFIED`, **TrueSeal Demo Organization**, and the signed destination.
4. Select **Open Destination** manually to view the demonstration page. Try an unsigned random QR to see a nonverified result.

The auth API is already protected by server-side sessions and same-origin checks. The organization interface does not persist raw access keys. There is no public registration or automatic URL opening.

## Limitations

- **Revocation display** is implemented for previously revoked D1 records, but the **revocation management endpoint/button is not implemented** in this emergency release.
- The demo account and approved destination are limited to TrueSeal's own domain. Other organizations must not be represented as officially trusted.
- Secure production deployment, D1 runtime behavior, and real-phone verification must be tested after the human-controlled GitHub merge and Cloudflare deploy. Consult `STATUS.md` and `EMERGENCY_RELEASE_HANDOFF.md` for evidence and commands.

Never commit `.dev.vars`, `.env`, local D1 state, raw access keys, private keys or session cookies.
