# Finance Demo App — Handoff

Personal finance tracker demo app. Built as a learning project: React frontend, Express backend, Supabase for auth/database, deployed entirely on free tiers.

## Live links

- **Website:** https://mlggamingnird.github.io/finance-demo-app/
- **API:** https://finance-demo-api.onrender.com
- **Code:** https://github.com/MLGGamingNird/finance-demo-app (public)
- **Database/Auth:** Supabase project `fpuczozmwjwyajoznojp`

## Stack

| Piece | Tech | Hosted on |
|---|---|---|
| Frontend | React + Vite | GitHub Pages |
| Backend | Node.js + Express | Render (free tier) |
| Database + Auth | Supabase (Postgres) | Supabase (free tier) |

## Architecture

```
Browser → React app (GitHub Pages)
            ├─→ Supabase Auth directly (signup/login)
            └─→ Express API (Render) → Supabase Postgres (transactions)
```

The frontend talks to Supabase directly for auth, but goes through the Express backend for transaction data — the backend verifies the Supabase JWT on every request (`server/src/lib/requireAuth.js`) before touching the database.

## What's built so far

- Two-step signup/login, plus a one-click **Try the demo** login (a private sandbox account per click with six months of sample data, deleted after 24 hours; see `server/src/routes/demo.js`)
- Transactions: add, edit, delete, with income/expense, categories and dates; month + category filters
- Categories (per-user, income/expense) and monthly budgets with progress bars
- Dashboard: month picker, summary cards, spending-by-category and income-vs-spending charts (Recharts, lazy-loaded, with table views)
- AI via **Groq** (decided): auto-categorization on create (history first, then LLM) and an "Ask about your spending" chat
- Tests (Vitest + Supertest, including cross-user isolation) and CI (`.github/workflows/ci.yml`) against a throwaway local Supabase
- Schema lives in `supabase/migrations/` (applied with `npm run migrate`); `supabase.sql` is the same schema as one file for fresh projects

See README.md for the full feature list and design decisions.

## Local dev setup

```
# server
cd server
cp .env.example .env   # SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ optional GROQ_API_KEY, SUPABASE_DB_URL)
npm install
npm run dev             # http://localhost:4000

# client
cd client
cp .env.example .env   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY + VITE_API_URL
npm install
npm run dev             # http://localhost:5173
```

Supabase keys are in the Supabase dashboard → Project Settings → API. `SUPABASE_DB_URL` (Connect → Session pooler URI) is only needed for `npm run migrate`. Tests: `cd server && npm test` (integration tests only run against a local Supabase, or with `ALLOW_REMOTE_TESTS=1`).

## Deployment — how it works

Both deploys trigger automatically on `git push` to `master`. No manual redeploy step needed.

- **GitHub Pages**: `.github/workflows/deploy-pages.yml`, only runs when `client/**` changes. Build-time secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`) are stored as GitHub Actions secrets (Settings → Secrets and variables → Actions) — not committed to the repo.
- **Render**: `render.yaml` blueprint, runs on every push to `master` regardless of what changed (harmless — just rebuilds the same backend if only the frontend changed). Env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLIENT_ORIGIN`, `GROQ_API_KEY`) are set in the Render dashboard.
- **Database changes are not deployed automatically.** Run `npm run migrate` in `server/` *before* pushing code that depends on a new migration.
- **CI** (`.github/workflows/ci.yml`) runs lint, build and tests on every push, but doesn't block Render or Pages deploys.

### Known gotchas

- **Render free tier sleeps after 15 min idle** — first request after that takes 30-60s to wake up. Normal, not a bug.
- **GitHub Pages serves from a subpath** (`/finance-demo-app/`), so `vite.config.js` has `base: '/finance-demo-app/'` set — don't remove it or the deployed site will break.
- **CORS**: the backend only allows requests from `CLIENT_ORIGIN` (set to `https://mlggamingnird.github.io`). If the Pages URL ever changes, update that env var in Render.
- **Supabase email confirmation**: if enabled, new signups won't get a usable session until they click a confirmation link — and Supabase's built-in email sender has a very low free rate limit. Check Authentication → Providers → Email in the Supabase dashboard if signups seem stuck.
- **Groq retires models.** If AI features silently stop working, check the available models (`GET https://api.groq.com/openai/v1/models`) and set `GROQ_FAST_MODEL` / `GROQ_CHAT_MODEL` in Render.
- `.env` files are git-ignored in both `client/` and `server/` — never commit real keys. The Supabase `anon` key is safe to expose client-side; the `service_role` key is not and only lives in Render's env vars.

## Next steps

The two-week plan is done. Ideas from the README's "What I'd do next": stream chat responses, a shared-store rate limiter, Playwright end-to-end tests.
