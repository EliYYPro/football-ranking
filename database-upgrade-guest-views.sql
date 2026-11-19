-- Applied to Football Ranking Supabase: 2026-11-19
-- Existing security-invoker league view keeps guests out of all standings.
create or replace view public.leaderboard with (security_invoker = true) as
select p.id,p.name,p.photo_url,p.team_name,
       coalesce(sum(r.points),0)::integer as total_points,
       count(r.id) filter(where r.won = true)::integer as total_wins,
       count(r.id)::integer as rounds_played
from public.players p
left join public.results r on r.player_id=p.id
where p.is_active=true and p.is_guest=false
group by p.id,p.name,p.photo_url,p.team_name;

-- The public team archive DOES include temporary guests (with their rating),
-- so they are still visible in lineups without appearing in league scoring.
create or replace view public.public_team_archive as
select s.id as session_id,s.round_number,s.session_date,
       s.preferred_team_size,s.team_count,s.selected_team_colors,
       s.selected_count,s.balance_score,
       a.team_color,a.team_position,
       p.id as player_id,p.name as player_name,p.photo_url as player_photo_url,
       p.is_guest,p.guest_level
from public.training_sessions s
join public.training_assignments a on a.session_id=s.id
join public.players p on p.id=a.player_id
where s.status='confirmed';
