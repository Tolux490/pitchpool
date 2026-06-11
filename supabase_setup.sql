-- ============================================================
-- PITCH POOL — World Cup 2026 draft pool
-- Paste this whole file into Supabase > SQL Editor > Run
-- ============================================================

-- 1) PROFILES (username per account)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default 'player',
  created_at timestamptz default now()
);

-- auto-create a profile on signup, using the username from the signup form
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) POOLS
create table if not exists public.pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  owner uuid not null references auth.users(id) on delete cascade,
  num_players int not null check (num_players in (2,3,4,6,8)),
  status text not null default 'lobby' check (status in ('lobby','drafting','playing')),
  draft_order jsonb,
  created_at timestamptz default now()
);

-- 3) MEMBERS
create table if not exists public.pool_members (
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (pool_id, user_id)
);

-- 4) PICKS (one nation can only be drafted once per pool)
create table if not exists public.picks (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nation text not null,
  pick_number int not null,
  created_at timestamptz default now(),
  unique (pool_id, nation),
  unique (pool_id, pick_number)
);

-- 5) RESULTS (match log; points are computed from this)
create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  stage text not null check (stage in ('GROUP','R32','R16','QF','SF','F')),
  team_a text not null,
  team_b text,
  outcome text not null check (outcome in ('A','B','D')),
  recorded_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- helper to check membership without RLS recursion
create or replace function public.is_pool_member(p uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.pool_members where pool_id = p and user_id = auth.uid());
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- (any signed-in user can read; writes are restricted)
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.pools         enable row level security;
alter table public.pool_members  enable row level security;
alter table public.picks         enable row level security;
alter table public.results       enable row level security;

-- profiles
create policy "profiles read"   on public.profiles for select to authenticated using (true);
drop policy if exists "profiles insert" on public.profiles;
create policy "profiles insert" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles update" on public.profiles;
create policy "profiles update" on public.profiles for update to authenticated using (id = auth.uid());

-- pools
create policy "pools read"   on public.pools for select to authenticated using (true);
drop policy if exists "pools insert" on public.pools;
create policy "pools insert" on public.pools for insert to authenticated with check (owner = auth.uid());
drop policy if exists "pools update" on public.pools;
create policy "pools update" on public.pools for update to authenticated using (owner = auth.uid());
drop policy if exists "pools delete" on public.pools;
create policy "pools delete" on public.pools for delete to authenticated using (owner = auth.uid());

-- members
create policy "members read"   on public.pool_members for select to authenticated using (true);
drop policy if exists "members insert" on public.pool_members;
create policy "members insert" on public.pool_members for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "members delete" on public.pool_members;
create policy "members delete" on public.pool_members for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.pools where id = pool_id and owner = auth.uid()));

-- picks
create policy "picks read"   on public.picks for select to authenticated using (true);
drop policy if exists "picks insert" on public.picks;
create policy "picks insert" on public.picks for insert to authenticated
  with check (user_id = auth.uid() and public.is_pool_member(pool_id));
drop policy if exists "picks delete" on public.picks;
create policy "picks delete" on public.picks for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.pools where id = pool_id and owner = auth.uid()));

-- results
create policy "results read"   on public.results for select to authenticated using (true);
drop policy if exists "results insert" on public.results;
create policy "results insert" on public.results for insert to authenticated
  with check (recorded_by = auth.uid() and public.is_pool_member(pool_id));
drop policy if exists "results delete" on public.results;
create policy "results delete" on public.results for delete to authenticated
  using (recorded_by = auth.uid() or exists (select 1 from public.pools where id = pool_id and owner = auth.uid()));

-- ============================================================
-- REALTIME (live updates while drafting / recording results)
-- ============================================================
alter publication supabase_realtime add table public.pools;
alter publication supabase_realtime add table public.pool_members;
alter publication supabase_realtime add table public.picks;
alter publication supabase_realtime add table public.results;
