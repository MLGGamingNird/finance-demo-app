import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? '';
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);

// Integration tests create and delete real users, so they only run against
// a local Supabase stack (CI) unless explicitly allowed for a remote one.
export const canRunIntegration =
  Boolean(url && process.env.SUPABASE_SERVICE_ROLE_KEY) && (isLocal || process.env.ALLOW_REMOTE_TESTS === '1');

// CI sets this so a misconfigured database fails the build instead of
// silently skipping the tests that matter most.
if (process.env.REQUIRE_INTEGRATION === '1' && !canRunIntegration) {
  throw new Error('REQUIRE_INTEGRATION is set but no local Supabase is configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, noSession);
}

// A client that talks to Supabase directly as the given user, the way the
// browser could, so tests can check row-level security on its own.
export function userClient(accessToken) {
  return createClient(url, process.env.SUPABASE_ANON_KEY, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function createTestUser() {
  const admin = adminClient();
  const email = `test-${randomUUID()}@finance-demo-app.dev`;
  const password = randomUUID();

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;

  const signIn = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, noSession);
  const { data: session, error: signInError } = await signIn.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { id: data.user.id, token: session.session.access_token };
}

// Deleting the auth user cascades to all of their rows.
export async function deleteTestUser(user) {
  if (user) await adminClient().auth.admin.deleteUser(user.id);
}
