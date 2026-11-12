-- Football Ramat Efaal: red cards and adjustable winner-photo framing.
-- Run once in the Football Ranking project's Supabase SQL Editor.
-- Non-destructive: existing results and rounds remain unchanged.
begin;

alter table public.results
  add column if not exists red_card boolean not null default false;

alter table public.rounds
  add column if not exists winner_photo_position smallint not null default 16;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rounds'::regclass
      and conname = 'rounds_winner_photo_position_check'
  ) then
    alter table public.rounds add constraint rounds_winner_photo_position_check
      check (winner_photo_position between 0 and 100);
  end if;
end $$;

commit;
