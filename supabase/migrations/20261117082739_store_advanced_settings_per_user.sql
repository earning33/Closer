-- Store advanced app and privacy preferences per account instead of only in browser localStorage.
ALTER TABLE public.user_settings
  ADD COLUMN advanced_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT user_settings_advanced_settings_object_check
    CHECK (
      jsonb_typeof(advanced_settings) = 'object'
      AND octet_length(advanced_settings::text) <= 8192
    );

COMMENT ON COLUMN public.user_settings.advanced_settings
IS 'Per-user advanced app and privacy preferences. This stores preferences only; feature enforcement remains in the corresponding backend policies.';
