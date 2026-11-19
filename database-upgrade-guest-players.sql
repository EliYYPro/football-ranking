-- Football Ranking: special temporary guests for team allocation only.
-- Safe, non-destructive migration. Does not guess which existing three players
-- are the placeholders; classify those three explicitly after inspecting IDs.
begin;

alter table public.players
  add column if not exists is_guest boolean not null default false;

alter table public.players
  add column if not exists guest_level smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.players'::regclass
      and conname = 'players_guest_level_check'
  ) then
    alter table public.players add constraint players_guest_level_check
      check (
        (is_guest = true and guest_level in (3,5,7))
        or (is_guest = false and guest_level is null)
      );
  end if;
end $$;

-- Prevent these participants from ever receiving league results or points.
create or replace function public.reject_guest_league_result()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.players
    where id = new.player_id and is_guest = true
  ) then
    raise exception 'Temporary guest players cannot receive league results'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists results_no_guest_players on public.results;
create trigger results_no_guest_players
before insert or update of player_id, points, won on public.results
for each row execute function public.reject_guest_league_result();

revoke all on function public.reject_guest_league_result() from public;
commit;

-- Post-migration: mark precisely identified guest player IDs as:
-- is_guest=true, guest_level=7/5/3, is_active=false, name='שחקן מזדמן 7/5/3'.
-- Do NOT automatically pick the three rows based on rating or similar names.
