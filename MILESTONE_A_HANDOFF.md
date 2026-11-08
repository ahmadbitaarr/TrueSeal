# TrueSeal Milestone A — CP04, CP05, CP06 (manual application)

This is **only an overlay** on the approved CP03 `main` commit
`c27a38a2fa4e268cc0e90897e5550d4d9e7a1161`. It is NOT a replacement repository.
No Git commands or Cloudflare account mutations have been executed by the implementation assistant.
Do not begin CP07 until the Planning Lead approves this milestone.

## 1. Apply overlay safely in VS Code PowerShell

Your branch is already `feat/milestone-a-secure-issuance`. From PowerShell:

```powershell
cd C:\dev\TrueSeal-GitHub
if ((git branch --show-current).Trim() -ne 'feat/milestone-a-secure-issuance') { throw 'Wrong branch' }
if ((git rev-parse HEAD).Trim() -ne 'c27a38a2fa4e268cc0e90897e5550d4d9e7a1161') { throw 'Wrong baseline; stop' }
if (git status --porcelain) { throw 'Uncommitted files: review them first, do not overwrite' }

$zip = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads\trueseal-milestone-a-overlay.zip'
$stage = Join-Path $env:TEMP 'trueseal-milestone-a-overlay'
if (Test-Path $stage) { throw "Staging folder already exists: $stage (choose a new location; do not overwrite)" }
Expand-Archive -LiteralPath $zip -DestinationPath $stage

# Scope is limited to the explicit paths listed below. No blanket recursive copy.
$paths = @(
  '.dev.vars.example', '.gitignore', 'STATUS.md', 'MILESTONE_A_HANDOFF.md',
  'migrations/0001_secure_issuance.sql',
  'src/shared/qrLimits.ts', 'src/lib/qr.ts', 'src/App.tsx', 'tsconfig.functions.json',
  'functions/_lib/auth.ts', 'functions/_lib/auth.test.ts',
  'functions/_lib/config.ts', 'functions/_lib/destinations.ts',
  'functions/_lib/destinations.test.ts', 'functions/_lib/http.ts',
  'functions/_lib/issue.ts', 'functions/_lib/issue.test.ts',
  'functions/api/auth/login.ts', 'functions/api/auth/session.ts',
  'functions/api/auth/logout.ts',
  'functions/api/issuer/codes/index.ts', 'functions/api/issuer/codes/[id].ts',
  'scripts/provision-demo.mjs', 'scripts/milestone-a-smoke.mjs',
  'tests/check_migration.py'
)
$replacements = @('.dev.vars.example', '.gitignore', 'STATUS.md', 'src/lib/qr.ts', 'src/App.tsx', 'tsconfig.functions.json')
foreach ($path in $paths) {
  if (-not (Test-Path -LiteralPath (Join-Path $stage $path))) { throw "Missing overlay file: $path" }
  if ((Test-Path -LiteralPath $path) -and $path -notin $replacements) { throw "Unexpected collision: $path" }
}
$backup = Join-Path $env:TEMP ('trueseal-milestone-a-backup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $backup | Out-Null
foreach ($path in $replacements) {
  $dest = Join-Path $backup $path
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item -LiteralPath $path -Destination $dest
}
foreach ($path in $paths) {
  $dest = Join-Path (Get-Location) $path
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item -LiteralPath (Join-Path $stage $path) -Destination $dest
}
Write-Host 'Overlay copied. Review changes before committing. Backup:' $backup
```

If your current repository differs, stop and compare files. Never overwrite a newer `STATUS.md` or QR utility blindly.

## 2. Required local dependency / code checks

Use **Node 22**. This overlay adds **no npm dependencies**; your existing `package-lock.json` remains unchanged.

```powershell
node --version
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run check
python tests/check_migration.py  # Optional dependency-free SQLite contract check; NOT D1 verification
```

Do not treat Python SQLite checks or mocked Vitest D1 tests as Cloudflare D1 acceptance. All above checks must pass.

## Backend API contract (Milestone A only)

- `POST /api/auth/login`: JSON `{ "accessKey": "<secret>" }` (send from the same origin). Returns safe issuer metadata and a four-hour `__Host-trueseal-session` cookie.
- `GET /api/auth/session`: returns safe issuer session information or HTTP 401.
- `POST /api/auth/logout`: same-origin, invalidates D1 session immediately and clears cookie.
- `POST /api/issuer/codes`: same-origin authenticated JSON `{ "title": "Demo", "destinationUrl": "https://trueseal-431.pages.dev/demo", "expirationDays": 7 }`; days allowed: 1, 7, 30 (default 7). Returns HTTP 201 **only after** signing and D1 persistence.
- `GET /api/issuer/codes` and `GET /api/issuer/codes/:id`: authenticated issuer-scoped code readback (limit 100 on list).

No public verifier, issuer registration, revocation API or organization dashboard is provided. Do not treat the generated `/v/<token>` link as already verified.

## 3. LOCAL CP04 — migrate and provision one demonstration issuer

The existing Wrangler config uses D1 `trueseal-db` and binding `DB`. **Only use `--local` here.**

```powershell
npx.cmd wrangler d1 migrations list trueseal-db --local
npx.cmd wrangler d1 migrations apply trueseal-db --local
npx.cmd wrangler d1 execute trueseal-db --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
node scripts/provision-demo.mjs --local
npx.cmd wrangler d1 execute trueseal-db --local --file .local/local-demo-seed.sql
npx.cmd wrangler d1 execute trueseal-db --local --command "SELECT id, display_name, trust_tier, status FROM issuers"
npx.cmd wrangler d1 execute trueseal-db --local --command "SELECT kid, issuer_id, public_jwk, status FROM issuer_keys"
npx.cmd wrangler d1 execute trueseal-db --local --command "SELECT issuer_id, hostname FROM issuer_allowed_hosts"
```

The provisioner writes **ignored files**: `.dev.vars` (server-only local secrets),
`.local/local-access-key.txt` (access key: do not display in logs),
`.local/local-demo-seed.sql` (public-only JWK seed), and
`.local/local-public-jwk.json` (public key). It refuses overwrite/rekey if run twice.

Check the D1 registered `public_jwk` against `.local/local-public-jwk.json` without pasting either private material or access keys. Rerunning seed uses conflict-DO-NOTHING; a mismatched existing key is NOT overwritten. A mismatched key must be resolved through a reviewed, explicit key-rotation plan, not by overriding old signed codes.

CP04 acceptance requires real D1 queries, foreign-key, unique-record and immutability checks. Test fresh D1 if possible; do not point these tests at production.

## 4. LOCAL CP05 and CP06 — Pages Functions + D1 end-to-end

In terminal A:

```powershell
npm.cmd run dev:edge
```

Wrangler normally serves on `http://localhost:8788`. For the smoke script, explicitly start the Pages dev server at `127.0.0.1:8788` if needed; use:

```powershell
npm.cmd run build
npx.cmd wrangler pages dev dist --ip 127.0.0.1 --port 8788
```

In terminal B:

```powershell
curl.exe -i http://127.0.0.1:8788/api/health
node scripts/milestone-a-smoke.mjs
```

The smoke script sends real HTTP requests to the local Pages runtime and DB. It verifies
D1 health, anonymous denial, credential rejection, same-origin guard, session creation,
`__Host-` cookie attributes, token-hash sessions, authenticated issuance, Ed25519
signature + registered public key, destination attacks, QR PNG round-trip,
issuer-scoped protected readback, logout, and D1-backed throttling. It prints PASS/FAIL
checks **without printing access keys, session tokens or signed token bodies**.

**Production uses the same `Secure` cookie policy.** Local HTTP testing uses direct
Node HTTP requests that supply the secure cookie explicitly. Do not weaken cookie
attributes or create an insecure production fallback. The browser issuer login UI
is future CP09 work; these are private APIs.

## 5. Secret configuration for Cloudflare (HUMAN ONLY)

After all local gates pass, use a *new independent production keypair*. Manually run:

```powershell
node scripts/provision-demo.mjs --production
```

This creates ignored `.local/production-secrets.txt`,
`.local/production-access-key.txt`, `.local/production-demo-seed.sql`,
`.local/production-public-jwk.json`. Never commit, screenshot, email, or paste
private values into this chat. Restrict access to these files and remove local
production secret copies when safely stored.

Human-controlled Cloudflare setup sequence:

1. Open Cloudflare Dashboard → Workers & Pages → `trueseal` → Settings → Variables and Secrets. Confirm the production D1 binding named `DB` targets `trueseal-db`.
2. Apply reviewed **production** migration manually (this modifies remote D1; only YOU run it):
   ```powershell
   npx.cmd wrangler d1 migrations list trueseal-db --remote
   npx.cmd wrangler d1 migrations apply trueseal-db --remote
   ```
3. Seed only the public issuer/key/host registry, after inspecting the public SQL:
   ```powershell
   npx.cmd wrangler d1 execute trueseal-db --remote --file .local/production-demo-seed.sql
   ```
4. In Cloudflare, set **encrypted secrets** `TRUSEAL_ACCESS_KEY_SHA256`,
   `TRUSEAL_THROTTLE_SECRET`, `TRUSEAL_SIGNING_PRIVATE_JWK` using the
   values from `.local/production-secrets.txt` privately, and server-only
   configuration `TRUSEAL_PUBLIC_ORIGIN=https://trueseal-431.pages.dev`,
   `TRUSEAL_SIGNING_KID=trueseal-demo-ed25519-v1`.
5. Redeploy only after D1, keys, and secrets match. Verify HTTPS and the protected
   API using manually supplied credentials; NEVER run destructive rate-limit tests
   against production or paste credentials/results containing session cookies.

Preview environments must not accidentally use production signing secrets with a
separately generated mismatched registry. Use an isolated preview D1 and keys if
preview issuance testing is required; otherwise preview issuance must fail closed.

**CAUTION:** If the DB already contains a demo key with this `kid`, `ON CONFLICT DO NOTHING`
will keep that key. Check the registered public JWK matches the matching private JWK
*before* allowing issuance. Do not overwrite historical public keys.

Cloudflare official documentation:
- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/d1/best-practices/local-development/
- https://developers.cloudflare.com/pages/functions/bindings/

## 6. GitHub handoff — HUMAN RUNS ALL COMMANDS

Only after the full checks and real local D1 gates pass:

```powershell
cd C:\dev\TrueSeal-GitHub
git branch --show-current
git status --short
git diff --check
git diff -- .gitignore .dev.vars.example src/lib/qr.ts src/App.tsx tsconfig.functions.json STATUS.md
```

Inspect every new file and scan the intended changes for private material. Stage only
Milestone A paths (never `.dev.vars`, `.local`, or private keys):

```powershell
git add -- .dev.vars.example .gitignore STATUS.md MILESTONE_A_HANDOFF.md migrations/0001_secure_issuance.sql src/shared/qrLimits.ts src/lib/qr.ts src/App.tsx tsconfig.functions.json functions/_lib/auth.ts functions/_lib/auth.test.ts functions/_lib/config.ts functions/_lib/destinations.ts functions/_lib/destinations.test.ts functions/_lib/http.ts functions/_lib/issue.ts functions/_lib/issue.test.ts functions/api/auth/login.ts functions/api/auth/session.ts functions/api/auth/logout.ts functions/api/issuer/codes/index.ts ':(literal)functions/api/issuer/codes/[id].ts' scripts/provision-demo.mjs scripts/milestone-a-smoke.mjs tests/check_migration.py

git diff --cached --check
git diff --cached --name-only
git status --short
```

Confirm that `.dev.vars`, `.local` and any private key files are **not staged**. Inspect
`git diff --cached` in VS Code without pasting credential contents anywhere. Then:

```powershell
git commit -m "feat(milestone-a): secure issuer registry authentication and signed issuance"
git rev-parse HEAD
git push -u origin feat/milestone-a-secure-issuance
```

Open **one PR** from `feat/milestone-a-secure-issuance` → `main` in the GitHub UI.
Check Node 22 CI and all quality gates, review the diff, and merge **manually**.
After merge, in PowerShell:

```powershell
git switch main
git pull --ff-only origin main
git rev-parse HEAD
git status --short
```

Record the *tested feature SHA*, PR URL, CI results, and the separate *merge SHA*
in `STATUS.md` (prefer updating this inside the same PR if available); do not claim
remote deployment until the production D1 and protected API are separately verified.

## Scope / known constraints

- No public QR verification (`CP07`) has been implemented; signed issuance is not proof of current trust for student-facing results.
- No issuer login dashboard UI (`CP09`), no revocation API (`CP10`), no student accounts or analytics.
- The QR length guard uses CP03's conservative 1,200-byte limit, with real QR PNG round-trip tested separately.
- Existing dependency audit findings and Node 24 workstation differences require human follow-up; do not run `npm audit fix --force`.
- This environment could not install all npm packages (registry unavailable; offline `ENOTCACHED`). Full Vitest/TypeScript/lint/build and Cloudflare workerd tests must run on your machine before acceptance.
