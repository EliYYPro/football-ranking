-- FOOTBALL RANKING V2
-- This is the schema already installed in the user's Supabase project.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on table public.app_admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text,
  team_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  round_number integer not null unique,
  round_date date not null default current_date,
  notes text,
  winner_photo_url text,
  winner_caption text,
  created_at timestamptz not null default now()
);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  points integer not null default 0 check (points >= 0 and points <= 3),
  won boolean not null default false,
  opponent_team text,
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create index if not exists results_player_id_idx on public.results(player_id);
create index if not exists results_round_id_idx on public.results(round_id);
create index if not exists players_active_idx on public.players(is_active);

alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.results enable row level security;

revoke all on table public.players from anon, authenticated;
revoke all on table public.rounds from anon, authenticated;
revoke all on table public.results from anon, authenticated;

grant select on table public.players to anon, authenticated;
grant select on table public.rounds to anon, authenticated;
grant select on table public.results to anon, authenticated;
grant insert, update, delete on table public.players to authenticated;
grant insert, update, delete on table public.rounds to authenticated;
grant insert, update, delete on table public.results to authenticated;

drop policy if exists "Public read players" on public.players;
create policy "Public read players" on public.players for select to anon, authenticated using (true);
drop policy if exists "Public read rounds" on public.rounds;
create policy "Public read rounds" on public.rounds for select to anon, authenticated using (true);
drop policy if exists "Public read results" on public.results;
create policy "Public read results" on public.results for select to anon, authenticated using (true);

drop policy if exists "Admin insert players" on public.players;
create policy "Admin insert players" on public.players for insert to authenticated with check (public.is_admin());
drop policy if exists "Admin update players" on public.players;
create policy "Admin update players" on public.players for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admin delete players" on public.players;
create policy "Admin delete players" on public.players for delete to authenticated using (public.is_admin());

drop policy if exists "Admin insert rounds" on public.rounds;
create policy "Admin insert rounds" on public.rounds for insert to authenticated with check (public.is_admin());
drop policy if exists "Admin update rounds" on public.rounds;
create policy "Admin update rounds" on public.rounds for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admin delete rounds" on public.rounds;
create policy "Admin delete rounds" on public.rounds for delete to authenticated using (public.is_admin());

drop policy if exists "Admin insert results" on public.results;
create policy "Admin insert results" on public.results for insert to authenticated with check (public.is_admin());
drop policy if exists "Admin update results" on public.results;
create policy "Admin update results" on public.results for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admin delete results" on public.results;
create policy "Admin delete results" on public.results for delete to authenticated using (public.is_admin());

drop view if exists public.leaderboard;
create view public.leaderboard with (security_invoker = true) as
select
  p.id,
  p.name,
  p.photo_url,
  p.team_name,
  coalesce(sum(r.points), 0)::integer as total_points,
  count(r.id) filter (where r.won = true)::integer as total_wins,
  count(r.id)::integer as rounds_played
from public.players p
left join public.results r on r.player_id = p.id
where p.is_active = true
group by p.id, p.name, p.photo_url, p.team_name;
grant select on public.leaderboard to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('player-photos', 'player-photos', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('weekly-winners', 'weekly-winners', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read football images" on storage.objects;
create policy "Public read football images" on storage.objects
for select to anon, authenticated
using (bucket_id in ('player-photos','weekly-winners'));

drop policy if exists "Admin upload football images" on storage.objects;
create policy "Admin upload football images" on storage.objects
for insert to authenticated
with check (bucket_id in ('player-photos','weekly-winners') and public.is_admin());

drop policy if exists "Admin update football images" on storage.objects;
create policy "Admin update football images" on storage.objects
for update to authenticated
using (bucket_id in ('player-photos','weekly-winners') and public.is_admin())
with check (bucket_id in ('player-photos','weekly-winners') and public.is_admin());

drop policy if exists "Admin delete football images" on storage.objects;
create policy "Admin delete football images" on storage.objects
for delete to authenticated
using (bucket_id in ('player-photos','weekly-winners') and public.is_admin());
