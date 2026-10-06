# Finance Demo App — Phase 1

Personal finance tracker demo. Phase 1 = project scaffold, Supabase auth, and basic transaction CRUD end-to-end.

## Stack
- **client/** — React + Vite, Supabase Auth (email/password)
- **server/** — Node.js + Express API, verifies Supabase JWTs, talks to Postgres via Supabase service role

## Setup

1. **Create a free Supabase project** at https://supabase.com.
2. In the Supabase SQL editor, run `supabase.sql` (creates the `transactions` table + row-level security).
3. In Supabase project settings → API, grab:
   - Project URL
   - `anon` public key
   - `service_role` secret key

4. **Server:**
   ```
   cd server
   cp .env.example .env
   # fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
   npm run dev
   ```

5. **Client:**
   ```
   cd client
   cp .env.example .env
   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
   npm run dev
   ```

6. Open the client (usually http://localhost:5173), sign up with an email/password, and add a transaction. It should appear in the Supabase `transactions` table.

## What's next (phase 2+)
- Budgets & categories
- Spending charts (Recharts)
- AI transaction categorization + chat assistant (Ollama or Groq — see project notes)
