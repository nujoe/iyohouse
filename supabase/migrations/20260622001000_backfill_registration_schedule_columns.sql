-- Production safety backfill.
-- Some live databases may have the schedule-capacity migration without the older
-- registration schedule columns. Keep these idempotent so re-running is safe.

ALTER TABLE public.workshop_registrations_v2
ADD COLUMN IF NOT EXISTS schedule_key TEXT,
ADD COLUMN IF NOT EXISTS schedule_label TEXT,
ADD COLUMN IF NOT EXISTS schedule_date TEXT,
ADD COLUMN IF NOT EXISTS schedule_time TEXT,
ADD COLUMN IF NOT EXISTS snapshot_bio TEXT;
