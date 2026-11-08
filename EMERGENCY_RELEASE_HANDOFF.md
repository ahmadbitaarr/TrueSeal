# TrueSeal — Human-only emergency release steps

## 1. Apply release overlay (PowerShell; no Git commands are executed by the assistant)

The expected human-created branch is `feat/final-verification-release` at `1178f74a8dc24564c3bc9f3ecc1ee60bd404c60a`. The ZIP contains **only the changed/new files**, not an older replacement repository. Unzip to a temporary folder first.

```powershell
cd C:\dev\TrueSeal-GitHub
$ErrorActionPreference = 'Stop'
$zip = Join-Path $env:USERPROFILE 'Downloads\trueseal-emergency-release-overlay.zip'
$temp = Join-Path $env:TEMP 'trueseal-emergency-release-overlay'
if (Test-Path $temp) { throw "Temporary folder exists: $temp. Rename or inspect it first." }
Expand-Archive -LiteralPath $zip -DestinationPath $temp
$expected = '1178f74a8dc24564c3bc9f3ecc1ee60bd404c60a'
if ((git branch --show-current).Trim() -ne 'feat/final-verification-release') { throw 'Wrong branch' }
if ((git rev-parse HEAD).Trim() -ne $expected) { throw 'Wrong baseline' }
if (git status --porcelain) { throw 'Working tree not clean. Inspect changes first.' }
$paths = @(
 'functions/_lib/verify.ts', 'functions/_lib/verify.test.ts', 'functions/api/verify.ts',
 'src/shared/verification.ts', 'src/components/ScanResult.tsx',
 'src/components/OrganizationPortal.tsx', 'src/App.tsx', 'src/App.test.tsx',
 'scripts/milestone-a-smoke.mjs', 'README.md', 'STATUS.md', 'EMERGENCY_RELEASE_HANDOFF.md'
)
foreach ($path in $paths) {
  $src = Join-Path $temp $path
  if (!(Test-Path $src)) { throw "Missing package file: $path" }
  $dst = Join-Path (Get-Location) $path
  $folder = Split-Path $dst -Parent
  if (!(Test-Path $folder)) { New-Item -ItemType Directory -Force $folder | Out-Null }
  Copy-Item -LiteralPath $src -Destination $dst -Force
}
```

## 2. Run quality gates in Node 22

```powershell
node --version
npm.cmd ci
npm.cmd test -- verify
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run check
```

**Do not commit until failures are fixed**. If registry access fails, fix Internet/DNS or use your machine's already installed dependencies. Do not bypass tests.

## 3. Real local Pages+D1 acceptance

Ensure the existing `.dev.vars` and local D1 test setup are in place. If your local database is not provisioned, use `MILESTONE_A_HANDOFF.md`; **do not run remote migrations or provision production secrets**. In a first terminal run:

```powershell
npm.cmd run dev:edge
```

In a second terminal:

```powershell
node scripts/milestone-a-smoke.mjs
```

This issues a real code against local Pages Functions and D1, verifies the Ed25519 signature and QR PNG round-trip, calls `/api/verify` expecting `VERIFIED`, confirms unsigned/tampered QR are non-verified, checks the direct `/v/<token>` SPA page, and tests existing auth controls. It uses the ignored local `.local` test fixtures. Never paste live access keys, session tokens or full signed QR values into public logs.

## 4. Commit and PR (human executes)

```powershell
git status --short
git diff --check
git diff --stat
git status --ignored --short
git add README.md STATUS.md EMERGENCY_RELEASE_HANDOFF.md scripts/milestone-a-smoke.mjs src/App.tsx src/App.test.tsx src/components/ScanResult.tsx src/components/OrganizationPortal.tsx src/shared/verification.ts functions/_lib/verify.ts functions/_lib/verify.test.ts functions/api/verify.ts
git diff --cached --check
git diff --cached --name-only
git diff --cached --numstat
git diff --cached | Select-String -Pattern 'PRIVATE KEY|"d"\s*:|accessKey\s*[:=]|__Host-trueseal-session=' -Context 1,1
```

Inspect ALL staged files manually. Verify `.dev.vars`, `.local`, secret JSON, credentials, session values, production signing private JWK, `node_modules` and D1 state are **not staged**. If suspicious, stop and unstage the offending file; do not push.

```powershell
git commit -m "feat(release): verify signed QR end to end and connect student flow"
git rev-parse HEAD
git push -u origin feat/final-verification-release
```

Open **one PR** from `feat/final-verification-release` into `main` at https://github.com/ahmadbitaarr/TrueSeal/pulls . Confirm Node 22 CI and Cloudflare preview build pass. Test preview against its own D1 and signing configuration as appropriate; preview URL must not be mistaken for production issuer origin. Merge manually and confirm production deploy with the new SHA.

## 5. Production smoke + video before submission

Use your own account and credentials, not ChatGPT. Check the actual deployed homepage and `/api/health`. Sign into **For organizations** on production, issue a signed QR for `https://trueseal-431.pages.dev/demo`, download its PNG. Open it on a second phone/device (or scan from another device). It must show `VERIFIED` with **TrueSeal Demo Organization** and the exact approved destination. Confirm a random QR shows `UNKNOWN` with no Open Destination link. Tamper a sample and confirm non-VERIFIED. Confirm a direct `/v/<token>` in a new incognito session works. Test logout, and ensure no QR auto-opens destinations.

Record a **1–3 minute** screen/phone demo: authorized issuer → signed code → student scan → genuine VERIFIED → explicit destination decision → unsigned QR not verified. Show Devpost link and project description; submit before **12:30 PM EST November 8, 2026**.

## Release limitations

- CP10 revocation management endpoint/button intentionally skipped; verification handles existing `revoked_at` data and returns REVOKED if present.
- Full automated tests and actual production verification have **not** been executed in the assistant environment due to missing npm packages/registry access.
- Branch push, PR, merge, CI, Cloudflare account changes, and production checks are strictly human controlled.
