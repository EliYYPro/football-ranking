Football Ranking — Team Builder V7

This update contains two main changes:

1) Deep fix for "צור חלוקה מאוזנת"
- Replaced the old 7,000 full random drafts with a deterministic first pass + lightweight local optimization.
- Much faster and more stable, especially on phones.
- Always keeps a fallback valid partition instead of failing silently.
- Missing player ratings still use a temporary neutral 5.0 for balancing only.
- Adds a readiness line under the button so the coach immediately sees if players/colors are missing.
- Keeps history/pair-repeat balancing and the weaker-average compensation for teams with an extra player.

2) New ADMIN page: "נתונים וסטטיסטיקות"
- Confirmed team allocations count.
- Players who participated and average players per round.
- Top player pairs: who played together most often.
- Player participation ranking.
- Individual player analysis:
  - appearances
  - unique teammates
  - most frequent teammates
  - shirt-color history
  - round-by-round teammates
- Range filter: entire season / last 10 / last 5 rounds.

No Supabase SQL migration is needed for V7.
The analytics page uses the existing training_sessions and training_assignments tables.
It remains ADMIN-only because those tables are already protected by your RLS policies.

Upload/replace these files inside GitHub /src:
- main.jsx
- styles.css
- TeamBuilder.jsx
- TeamAnalytics.jsx   (NEW FILE)

Then Commit changes. Vercel should deploy automatically.
