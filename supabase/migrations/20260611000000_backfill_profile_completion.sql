-- Backfill app-level profile completion for users created before completed_at existed.

UPDATE public.profiles
SET completed_at = COALESCE(updated_at, NOW())
WHERE completed_at IS NULL
  AND NULLIF(btrim(COALESCE(full_name, '')), '') IS NOT NULL
  AND NULLIF(btrim(COALESCE(phone, '')), '') IS NOT NULL
  AND NULLIF(btrim(COALESCE(email, '')), '') IS NOT NULL;
