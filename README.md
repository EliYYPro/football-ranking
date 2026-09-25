# Football Ranking — Team Builder V2

This update is designed to be installed AFTER Team Builder V1.

## What changed

### Player management (ADMIN only)
- Private player ratings are now edited from `ניהול שחקנים`, not from the team-builder workflow.
- The team-builder can only VIEW the ratings in a locked/read-only panel.
- Rating labels were simplified:
  - `מסירה / דיוק` -> `דיוק`
  - `מהירות ותנועה` -> `מהירות`
  - `פיזיות / סיבולת` -> `פיזיות`
- Every 1–10 rating can now be changed with either the slider OR a numeric input. They stay synchronized.
- First name + last name remain the player identity fields; the public site still displays one combined full name.

### Team builder workflow
1. Round number + date are now Step 1.
2. Attendance is Step 2.
3. Preferred size (4 / 5 / 6 per team) is Step 3, after attendance.
4. The screen now clearly shows:
   - how many players were selected,
   - target total for 4 teams,
   - actual team sizes based on attendance,
   - whether there are extra players or missing players versus the chosen target.
5. Confirmed allocations store the round number.
6. The next round defaults from the highest previously saved league/team-builder round so it does not go backwards.
7. Extra-player balancing logic remains: larger teams are optimized toward a lower average ability.

### Archives
- ADMIN archive now has two tabs:
  - `היסטוריית תמונות ניצחון`
  - `היסטוריית חלוקה לקבוצות`
- A new PUBLIC `/archive` page has the same two archive categories.
- Public users can view confirmed team allocations, but NEVER private player ratings.
- Winner photos are clickable and open large in a lightbox.
- Recent winner photos on the home page are clickable again.

### Round results
- Winner-photo description/caption input was removed.
- Saving a round clears the legacy winner caption; only the photo, round and date are used.

## Install order

### 1. Supabase
Run ONLY the new migration:
`supabase-team-builder-v2.sql`

Supabase -> SQL Editor -> New query -> paste all -> Run.

Do NOT run V1 again if it is already installed.

### 2. GitHub
Upload/replace these files inside `src/`:
- `main.jsx`
- `styles.css`
- `TeamBuilder.jsx`

Commit changes. Vercel deploys automatically.

## Privacy
`player_ratings` remains ADMIN-only. The public archive uses a dedicated safe database view that exposes only confirmed team allocations and public player name/photo.

## Cost
No paid AI/API is used. This continues to work with the existing free Supabase + Vercel setup, subject to their free-tier usage limits.
