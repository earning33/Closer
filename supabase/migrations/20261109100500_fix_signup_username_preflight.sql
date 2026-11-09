-- Fix CLOSER signup username collisions and persist the validated age.

CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN p_username IS NULL
      OR char_length(btrim(p_username)) < 3
      OR char_length(btrim(p_username)) > 30
      OR btrim(p_username) !~ '^[A-Za-z0-9_.]+$'
    THEN false
    ELSE NOT EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE lower(p.username) = lower(btrim(p_username))
    )
  END;
$function$;

REVOKE ALL ON FUNCTION public.is_username_available(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;

COMMENT ON FUNCTION public.is_username_available(text)
IS 'Returns only whether a syntactically valid CLOSER username is available; does not expose profile data.';

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

  INSERT INTO public.profiles (id, email, full_name, username, age)
  VALUES (
    new.id,
    new.email,
    nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
    v_username,
    v_age
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$function$;
