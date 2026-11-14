-- RLS controls row-level access, but table-level TRUNCATE is separate.
-- Remove TRUNCATE from browser-facing roles without changing CRUD grants.
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
