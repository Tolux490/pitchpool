-- ============================================================
-- PITCH POOL v3 — store actual match scores
-- Run in Supabase > SQL Editor (safe to re-run)
-- ============================================================
alter table public.results add column if not exists score_a int;
alter table public.results add column if not exists score_b int;
