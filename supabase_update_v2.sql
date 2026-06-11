-- ============================================================
-- PITCH POOL v2 — auto-sync update
-- Run this in Supabase > SQL Editor (safe to re-run)
-- ============================================================

-- auto-synced results have no human author
alter table public.results alter column recorded_by drop not null;

-- remember which API match each result came from (prevents duplicates)
alter table public.results add column if not exists external_id text;
create unique index if not exists results_pool_external
  on public.results (pool_id, external_id) where external_id is not null;
