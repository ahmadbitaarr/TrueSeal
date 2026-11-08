# TrueSeal

TrueSeal is a mobile-first QR authenticity project for KTP Hacks 2. This repository currently contains **Checkpoint 01 only**: a responsive frontend, a Cloudflare Pages Function health endpoint, and D1 binding configuration. **QR scanning, signed issuance, issuer access, signature verification, and revocation are not implemented yet.**

## Requirements

- Node.js **22** (`.nvmrc`), npm 10+
- An authorized Cloudflare account for remote D1 creation and Pages deployment
- An authorized GitHub account for manual version control and CI activation

## Install and run (local)

```bash
# Run from the project root. Install Node.js 22 first.
npm install              # Creates package-lock.json on first run; commit that lockfile.
npm ci                   # Required after package-lock.json exists.
npm run dev              # Vite frontend: http://localhost:5173
npm run check            # Typecheck, ESLint, Vitest, production build
npm run dev:edge         # Production build + Pages Functions: http://localhost:8788
```

In a second terminal while `dev:edge` is running:

```bash
curl -i http://localhost:8788/api/health
```

Success requires an actual D1 read-only query. Expected **only after connected local D1 works**:

```json
{"status":"ok","application":"ok","database":"connected"}
```

If D1 binding or query fails, the endpoint responds with **HTTP 503** and `{"status":"error","application":"ok","database":"unavailable"}`. `npm run dev` runs the Vite frontend only and does not serve `/api/health`; use `dev:edge` for the integration test. The local Wrangler D1 database is isolated from the production database; passing local health does not prove production connectivity.

## D1 database setup (human-authorized only)

No remote database has been created by this project. On your own authorized computer:

1. Run `npx wrangler login` and sign in (never paste a token or secret into chat).
2. Run `npx wrangler d1 list`. Reuse `trueseal-db` if it already exists in the intended Cloudflare account.
3. If it does not exist, **you** run `npx wrangler d1 create trueseal-db`.
4. Copy the nonsecret database UUID into `wrangler.jsonc` at `d1_databases[0].database_id`. The all-zero UUID currently in the file is a **sentinel placeholder**, **not a real remote DB ID**. Do not deploy with the sentinel.
5. Keep `binding` and `preview_database_id` exactly `DB`. The local D1 state will be created/used by `npm run dev:edge`, without remote D1 writes.
6. Optionally confirm the remote resource with `npx wrangler d1 info trueseal-db`. Never commit credentials.

Do not create app tables yet (CP04). See [Cloudflare's D1 guide](https://developers.cloudflare.com/d1/best-practices/local-development/) for the local Pages D1 configuration.

## GitHub and Cloudflare Pages deployment (human-authorized only)

Keep `main` stable. Commit CP01 on a short-lived `feat/cp-01-foundation` branch, open a PR, and require the `.github/workflows/ci.yml` workflow to pass before merging to `main`. The CI workflow uses `npm ci`, so **package-lock.json is mandatory**. Avoid committing `.dev.vars`, `.env` or private-key material; see `.gitignore`.

After the **human** creates/connects the repository and verifies real database UUID:

1. In [Cloudflare Workers & Pages](https://dash.cloudflare.com/), choose **Create application → Pages → Connect to Git** and authorize the repository.
2. Choose production branch **main**, root **/**, build command **`npm run build`**, output directory **`dist`**, Node.js version **22** (set nonsecret build variable `NODE_VERSION=22` if Cloudflare's build configuration needs it).
3. Ensure this repo's `wrangler.jsonc` is used as the Pages configuration source of truth, and verify the **DB** D1 binding points to `trueseal-db` in the intended Cloudflare account for production (and preview if preview is enabled). Do not leave conflicting dashboard bindings/configuration.
4. After CI passes and PR is merged, wait for the production deployment to succeed. Copy the **actual** HTTPS hostname from the Pages deployment dashboard.
5. Run `curl -i https://ACTUAL_HOST/api/health` (replace `ACTUAL_HOST` with the assigned hostname). Both 200 and JSON `"database":"connected"` are required. Check the mobile homepage in a real phone browser; verify buttons show honest placeholders.
6. Record deployment URL, response, branch, PR, SHA, checks, and date in `STATUS.md` after verification.

Official docs: [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [Pages Functions Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), [D1 CLI](https://developers.cloudflare.com/d1/wrangler-commands/).

## Security notes

- No signing or session credentials are created in CP01.
- Keep future secrets in ignored `.dev.vars` locally and platform secret settings remotely; never in `VITE_` variables, which become client-visible.
- `GET /api/health` checks `SELECT 1 AS healthy` and returns 503 on missing or failed D1 connections; it does not leak database exception text.
- Verification and security features are **not** implemented. Do not treat this foundation as a secure QR verifier.

## Checkpoint

See [STATUS.md](STATUS.md) for the 14-checkpoint ledger and evidence status. Do not begin CP02 without Planning Lead approval.
