-- Keep future public table defaults under least-privilege review.
-- This is scoped to tables created by postgres in public.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
