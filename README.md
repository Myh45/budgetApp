# Expense Tracker 3D — v1.0 Release Candidate

Minimal cash tracking with a 3D hub, Tilt & Zoom, Front UI (cash wallet), Back UI (Financial Timeline), Ukrainian/English, light/dark themes, and Supabase Auth/database.

**Status:** prepared for release, not deployed. The application uses real financial records: do not test with real data until access permissions and backup have been checked.

## Local run

1. Copy `config.example.js` to `config.js` **on your own computer**, or keep your existing working `config.js` in `ExpenseTracker_Integration`.
2. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the public values from your Supabase project. Never use a secret or `service_role` key.
3. Use VS Code Live Server to open `index.html` (typically `http://127.0.0.1:5500/index.html`). Requires network access for Supabase JS SDK.

Do not commit `config.js`. It is ignored by `.gitignore` for **new/untracked files**. If `config.js` was already committed in the repo, `.gitignore` alone does not untrack it.

## GitHub Pages deployment (GitHub Actions)

The workflow `.github/workflows/deploy-pages.yml` creates a **public** `config.js` during deployment from repository Actions secrets. These two values are shared across all users; individual data access depends on Supabase Auth + RLS, not on a per-user project key.

1. **Before updating main**, create a backup branch of the existing site (for example `backup/pre-3d-v1`). Do not delete the old branch.
2. In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**. Create:
   - `SUPABASE_URL` = your `https://<project>.supabase.co` project URL
   - `SUPABASE_PUBLISHABLE_KEY` = your `sb_publishable_...` key (or legacy anon key)
3. Make sure the repo's **Settings → Pages → Build and deployment → Source** is **GitHub Actions**.
4. Add these files to the root of the existing repository's `main` branch, including `.github/workflows/deploy-pages.yml`. Upload only after completing preflight checks.
5. Check **Actions** for a successful deployment, then open `https://myh45.github.io/budgetApp/`.
6. In **Supabase → Authentication → URL Configuration**, set `Site URL` to `https://myh45.github.io/budgetApp/` and add the same URL under Redirect URLs. Keep `http://127.0.0.1:5500/index.html` in Redirect URLs for local work.
7. Test sign-in, password reset, read/write/delete, mobile layout and cross-browser updates on the published HTTPS site.

**Note:** GitHub Actions secrets here are used for convenient deploy-time configuration, not to conceal the publishable key. The deployed `config.js` is readable by every browser. Never put private keys in that workflow or deployed files.

## Preflight checks — must pass before public use

- Verify Supabase RLS is enabled on both tables and only the record owner can select/insert/delete. The included `schema.sql` is for review; **do not re-run it blindly**.
- Test access from a separate test user; confirm that user cannot read or delete another person's records.
- Make a restorable backup of your wallet and transactions; a `Git` backup of the app files does **not** back up Supabase data.
- Confirm the opening balance and existing records are intact. Do not clear the database when deploying code.
- Confirm that the latest desktop and mobile layouts match the approved design.
- Test after publishing: login/logout, password recovery, income, expense, delete confirmation and balance recalculation, monthly history and four-period filtering.

## Rollback

Restore the previous site branch/version into `main` and redeploy. Supabase data is stored separately and should not be deleted during rollback. The new UI reads the same tables `cash_wallets` and `cash_transactions`.

## Files

- `index.html`, `app.js`, `style.css`: approved UI and behavior
- `core.js`: amounts and shared calculations
- `schema.sql`: reference-only database schema and RLS policies
- `config.example.js`: local configuration template (not the deployed configuration)
- `.github/workflows/deploy-pages.yml`: GitHub Pages deployment
- `.gitignore`: prevents accidental commit of new local `config.js`
