-- Fix CLOSER signup username collisions and persist validated age.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
AS $function$
DECLARE
  v_username text;
  v_age_text text;
  v_age integer;
  v_constraint_name text;
BEGIN
  v_username := lower(btrim(coalesce(new.raw_user_meta_data->>'username', '')));
  IF v_username !~ '^[a-z0-9_.]{3,30}$' THEN
    RAISE EXCEPTION 'A valid CLOSER username is required.'
      USING ERRCODE = '23514';
  END IF;

  v_age_text := coalesce(new.raw_user_meta_data->>'age', '');
  IF v_age_text !~ '^[0-9]{1,3}$' THEN
    RAISE EXCEPTION 'CLOSER requires members to be 18 or older.'
      USING ERRCODE = '23514';
  END IF;
  v_age := v_age_text::integer;
  IF v_age < 18 OR v_age > 120 THEN
    RAISE EXCEPTION 'CLOSER requires members to be 18 or older.'
      USING ERRCODE = '23514';
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, email, full_name, username, age)
    VALUES (
      new.id,
      new.email,
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      v_username,
      v_age
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
    IF v_constraint_name NOT IN ('profiles_username_key', 'public_profiles_username_key') THEN
      RAISE;
    END IF;

    -- A 64-bit UUID suffix avoids exposing private usernames to anonymous users.
    v_username := left(v_username, 13) || '_' || substr(replace(new.id::text, '-', ''), 1, 16);

    INSERT INTO public.profiles (id, email, full_name, username, age)
    VALUES (
      new.id,
      new.email,
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      v_username,
      v_age
    )
    ON CONFLICT (id) DO NOTHING;
  END;

  RETURN new;
END;
$function$;
