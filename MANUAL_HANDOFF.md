# CP01 — Human actions (GitHub and Cloudflare only)

**All commands on this page are for the human developer to execute.** Implementation Chat has not run Git commands, created remote accounts/resources, or authorized GitHub ↔ Cloudflare integration.

## A. Bring the files to an online Node 22 machine

1. Download `trueseal-cp01-foundation.zip` from the Implementation Chat deliverable, and extract it.
2. If a personal `trueseal` GitHub repo already exists, **clone it manually**. If not, create `trueseal` on GitHub with **Initialize with a README** checked, with default branch `main`, then clone it. A README bootstrap creates a `main` baseline so CP01 can go through a PR.
3. Work in a terminal inside your **cloned repository**, and create the feature branch before copying CP01 files:

```bash
git switch -c feat/cp-01-foundation
```

4. Copy **all contents, including dotfiles** of the extracted `trueseal/` folder into the cloned repo. Do not copy the extracted folder's parent directory. Do not overwrite important existing user files without reviewing them.
5. Check that `package.json`, `wrangler.jsonc`, `.github/workflows/ci.yml`, `.gitignore`, and `STATUS.md` exist in the cloned repo.

## B. Make local and remote D1 legitimate

In the cloned repo (Node 22 installed):

```bash
npm install
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run check
npx wrangler login
npx wrangler d1 list
```

If `trueseal-db` is absent in the intended account, **you** run:

```bash
npx wrangler d1 create trueseal-db
```

Replace `00000000-0000-0000-0000-000000000000` in `wrangler.jsonc` with the actual nonsecret D1 database UUID. Do not paste or commit auth tokens. Run the actual local Pages server:

```bash
npm run dev:edge
```

In **another terminal** in the same machine, check:

```bash
curl -i http://localhost:8788/api/health
```

Demand HTTP 200 and `{"status":"ok","application":"ok","database":"connected"}`. A 503 is not a passing test. This only proves local D1; production needs independent verification. Open local homepage on phone-size browser. Update `STATUS.md` with exact results, not predictions.

## C. Inspect then commit and push (human-only)

From the cloned repo on `feat/cp-01-foundation`:

```bash
git status --short
git add .
git diff --cached --check
git diff --cached --name-only
git ls-files --cached
git status --short
git commit -m "feat: establish TrueSeal CP01 foundation"
git rev-parse HEAD
git push -u origin feat/cp-01-foundation
```

**Before committing** inspect `git diff --cached --name-only`/`git ls-files --cached`: there must be **no** `.dev.vars`, `.env` (except `.env.example` if intentionally provided), key/cert files, `.wrangler`, `node_modules`, `dist`, or real secrets. If discovered, unstage/remove them before committing. Confirm that `package-lock.json` is included. (No secrets are required for CP01.)

On GitHub: open a PR from `feat/cp-01-foundation` to `main`, wait for the **CI** check to pass, review changed files, then merge manually. Copy the PR URL, tested head SHA, and merge SHA. Do not mark CP01 complete solely because a PR merged.

## D. Connect Pages and verify production (human-only)

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Select/authorize **your** `trueseal` repo (do not choose a similarly named public repository), branch `main`; set build command `npm run build`, output `dist`, root `/`, and Node 22 if requested. Use Cloudflare Pages Git integration (not a Direct Upload-only project).
3. Ensure Pages settings use `wrangler.jsonc` as source of truth; confirm the `DB` D1 binding maps to the correct `trueseal-db` UUID and has no contradictory dashboard setting. `wrangler.jsonc` in committed `main` must have the real UUID, not the all-zero placeholder.
4. Wait until Cloudflare shows the production deployment **Success**. Copy its *real* assigned HTTPS domain.
5. On your workstation, replace `ACTUAL_HOST` with this assigned hostname:

```bash
curl -i https://ACTUAL_HOST/api/health
```

6. Verify HTTP 200, `database: connected`, homepage over HTTPS, and mobile-size behavior on a real phone. Capture responses, CI results, PR and SHAs in `STATUS.md` (via another **human** change/commit). Send those results to Implementation Chat/Planning Lead for CP01 gate review.

Do **not** start CP02 without Planning Lead sign-off.

Docs: [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/) · [Pages Functions config](https://developers.cloudflare.com/pages/functions/wrangler-configuration/) · [D1 CLI](https://developers.cloudflare.com/d1/wrangler-commands/).
