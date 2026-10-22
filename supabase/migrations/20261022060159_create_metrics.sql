-- One row per dashboard metric (id = build.py AGGREGATES key, data = the JSON it produces).
create table public.metrics (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.metrics enable row level security;

-- Public dashboard: anyone may read. No insert/update/delete policy exists,
-- so only the service_role key (used by build.py) can write.
create policy "metrics are publicly readable"
  on public.metrics for select
  to anon, authenticated
  using (true);
