-- build.py writes with the secret (service_role) key; it bypasses RLS but still needs table privileges.
grant select, insert, update on public.metrics to service_role;
