// Applies any SQL files in supabase/migrations/ that haven't run yet.
// Usage: npm run migrate  (needs SUPABASE_DB_URL in server/.env)
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));

if (!process.env.SUPABASE_DB_URL) {
  console.error('Missing SUPABASE_DB_URL in server/.env');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  // Not exposed through the Supabase API.
  await client.query('alter table schema_migrations enable row level security');

  const { rows } = await client.query('select name from schema_migrations');
  const applied = new Set(rows.map((r) => r.name));
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) console.log('No pending migrations.');

  for (const file of pending) {
    console.log(`Applying ${file}...`);
    // Each migration file manages its own transaction.
    await client.query(await readFile(migrationsDir + file, 'utf8'));
    await client.query('insert into schema_migrations (name) values ($1)', [file]);
    console.log(`Applied ${file}`);
  }

  // Tell the Supabase API to pick up new tables and columns immediately.
  if (pending.length > 0) await client.query(`notify pgrst, 'reload schema'`);
} finally {
  await client.end();
}
