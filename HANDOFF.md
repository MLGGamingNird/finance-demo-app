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

- Two-step signup/login (email screen → password screen, with show/hide password toggle and confirm-password check on signup)
- Supabase email/password auth
- Transactions: add, list, delete — scoped per-user via `requireAuth` + row-level security in Postgres
- `supabase.sql` — schema + RLS policy (run once in Supabase SQL editor; already applied to the live project)

## Not built yet

- Budgets / categories
- Spending charts (Recharts was the plan)
- AI features (auto-categorization, chat assistant) — **decision pending**: use Ollama (local, free, no limits) or Groq (cloud, free tier, no card required). Avoid Gemini — hit billing/rate-limit issues in a prior project.

## Local dev setup

```
# server
cd server
cp .env.example .env   # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev             # http://localhost:4000

# client
cd client
cp .env.example .env   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY + VITE_API_URL
npm install
npm run dev             # http://localhost:5173
```

Supabase keys are in the Supabase dashboard → Project Settings → API.

## Deployment — how it works

Both deploys trigger automatically on `git push` to `master`. No manual redeploy step needed.

- **GitHub Pages**: `.github/workflows/deploy-pages.yml`, only runs when `client/**` changes. Build-time secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`) are stored as GitHub Actions secrets (Settings → Secrets and variables → Actions) — not committed to the repo.
- **Render**: `render.yaml` blueprint, runs on every push to `master` regardless of what changed (harmless — just rebuilds the same backend if only the frontend changed). Env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLIENT_ORIGIN`) are set in the Render dashboard.

### Known gotchas

- **Render free tier sleeps after 15 min idle** — first request after that takes 30-60s to wake up. Normal, not a bug.
- **GitHub Pages serves from a subpath** (`/finance-demo-app/`), so `vite.config.js` has `base: '/finance-demo-app/'` set — don't remove it or the deployed site will break.
- **CORS**: the backend only allows requests from `CLIENT_ORIGIN` (set to `https://mlggamingnird.github.io`). If the Pages URL ever changes, update that env var in Render.
- **Supabase email confirmation**: if enabled, new signups won't get a usable session until they click a confirmation link — and Supabase's built-in email sender has a very low free rate limit. Check Authentication → Providers → Email in the Supabase dashboard if signups seem stuck.
- `.env` files are git-ignored in both `client/` and `server/` — never commit real keys. The Supabase `anon` key is safe to expose client-side; the `service_role` key is not and only lives in Render's env vars.

## Next steps

1. Budgets + categories (schema addition + CRUD, same pattern as transactions)
2. Spending charts on the dashboard (Recharts)
3. AI integration — pick Ollama vs Groq, then add auto-categorization on transaction create + a basic chat endpoint
