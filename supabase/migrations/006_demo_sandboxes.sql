-- One row per "Try the demo" sandbox account, so the server can cap how many
-- exist and delete them once they expire. Deleting the auth user cascades to
-- this row and to all of the sandbox's data.

begin;

create table demo_sandboxes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index demo_sandboxes_created_at_idx on demo_sandboxes (created_at);

-- RLS with no policies: only the server's service role can read or write it.
alter table demo_sandboxes enable row level security;
revoke all on demo_sandboxes from anon, authenticated;

commit;
