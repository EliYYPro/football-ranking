Football Ranking — Team Builder V3

Run AFTER V2.

Changes:
- Adds a new step: number of teams (2 / 3 / 4)
- Adds shirt-color selection: pink / blue / cyan / white; coach selects exactly the number of active teams
- Renames team size to "כמות שחקנים פר קבוצה"
- Team-balancing algorithm now works with 2, 3 or 4 teams
- Uneven player counts remain supported; teams with an extra player are intentionally balanced to a lower average ability
- "חלוקות שאושרו" renamed to "חלוקות ממחזורים קודמים"
- Previous allocations can be edited or deleted from Team Builder history
- Player management now has a calculated "דירוג שחקן" column
- "נתוני יכולת" renamed to "נתונים"
- Attendance selections show the order number (1, 2, 3...) next to each selected player
- "צפה בנתונים" renamed to "צפייה בנתונים"
- Overall ratings use color levels: green -> blue -> amber -> red
- Public top navigation now includes "ראשי"
- Public/archive team displays only show the colors actually used in that round

INSTALL ORDER
1. Supabase -> SQL Editor -> New query
2. Run: supabase-team-builder-v3.sql
3. After Success, upload to GitHub /src:
   - main.jsx
   - styles.css
   - TeamBuilder.jsx
4. Commit changes; Vercel deploys automatically.

No paid AI/API service is required.
