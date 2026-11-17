-- Protect identity, age, verification, and moderation fields from self-service edits.
-- Admins retain their existing moderation permissions through private.is_admin().

CREATE OR REPLACE FUNCTION private.protect_profile_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() = OLD.id
     AND NOT COALESCE(private.is_admin(), false) THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.age IS DISTINCT FROM OLD.age
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.verified IS DISTINCT FROM OLD.verified
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.restriction_reason IS DISTINCT FROM OLD.restriction_reason THEN
      RAISE EXCEPTION 'Sensitive account fields can only be changed through authorized account or administrative flows.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION private.protect_profile_admin_fields()
IS 'Prevents non-admin users from changing identity, age, creation timestamp, verification, and moderation fields on their own profile.';
