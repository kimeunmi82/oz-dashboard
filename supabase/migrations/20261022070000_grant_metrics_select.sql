-- New Supabase projects do not auto-grant table privileges to the API roles.
-- Read-only: this grant plus the RLS select policy make the public dashboard work.
grant select on public.metrics to anon, authenticated;
