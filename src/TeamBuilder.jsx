import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const TEAM_COLORS = [
  { key: 'pink', name: 'ורוד', emoji: '🩷' },
  { key: 'blue', name: 'כחול', emoji: '🔵' },
  { key: 'cyan', name: 'תכלת', emoji: '🩵' },
  { key: 'white', name: 'לבן', emoji: '⚪' },
]

const RATING_FIELDS = [
  { key: 'technical', label: 'יכולת טכנית' },
  { key: 'passing', label: 'מסירה / דיוק' },
  { key: 'speed', label: 'מהירות ותנועה' },
  { key: 'attack', label: 'התקפה' },
  { key: 'defense', label: 'הגנה' },
  { key: 'physical', label: 'פיזיות / סיבולת' },
  { key: 'game_iq', label: 'חוכמת משחק' },
  { key: 'goalkeeper', label: 'יכולת בשער' },
]

const POSITION_OPTIONS = [
  ['general', 'כללי'],
  ['goalkeeper', 'שוער'],
  ['defense', 'הגנה'],
  ['midfield', 'קישור'],
  ['attack', 'התקפה'],
]

const emptyRating = {
  technical: 5,
  passing: 5,
  speed: 5,
  attack: 5,
  defense: 5,
  physical: 5,
  game_iq: 5,
  goalkeeper: 5,
  preferred_position: 'general',
}

function fullName(player) {
  return player?.name || [player?.first_name, player?.last_name].filter(Boolean).join(' ') || 'שחקן'
}

function ratingComplete(rating) {
  if (!rating) return false
  return RATING_FIELDS.every(({ key }) => Number(rating[key]) >= 1 && Number(rating[key]) <= 10)
}

function overallRating(rating) {
  if (!ratingComplete(rating)) return null
  const score =
    Number(rating.technical) * 0.18 +
    Number(rating.passing) * 0.14 +
    Number(rating.speed) * 0.10 +
    Number(rating.attack) * 0.15 +
    Number(rating.defense) * 0.15 +
    Number(rating.physical) * 0.10 +
    Number(rating.game_iq) * 0.18
  return Math.round(score * 10) / 10
}

function average(list) {
  if (!list.length) return 0
  return list.reduce((sum, n) => sum + Number(n || 0), 0) / list.length
}

function variance(list) {
  if (list.length < 2) return 0
  const avg = average(list)
  return average(list.map(n => (n - avg) ** 2))
}

function shuffled(list) {
  const next = [...list]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function pairKey(a, b) {
  return [a, b].sort().join('|')
}

function buildPairCounts(sessions, assignments) {
  const counts = new Map()
  const recentIds = new Set(sessions.slice(0, 12).map(s => s.id))
  const grouped = new Map()

  assignments.filter(a => recentIds.has(a.session_id)).forEach(a => {
    const key = `${a.session_id}:${a.team_color}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(a.player_id)
  })

  grouped.forEach(ids => {
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = pairKey(ids[i], ids[j])
        counts.set(key, (counts.get(key) || 0) + 1)
      }
    }
  })

  return counts
}

function teamMetrics(team) {
  const ratings = team.map(p => p.rating)
  const overalls = team.map(p => p.overall)
  return {
    size: team.length,
    overall: average(overalls),
    attack: average(ratings.map(r => Number(r.attack))),
    defense: average(ratings.map(r => Number(r.defense))),
    speed: average(ratings.map(r => Number(r.speed))),
    goalkeeper: average(ratings.map(r => Number(r.goalkeeper))),
  }
}

function evaluateTeams(teams, pairCounts) {
  const metrics = teams.map(teamMetrics)
  const avgSize = average(metrics.map(m => m.size))

  // A bigger team gets a numerical advantage, so the optimizer intentionally
  // seeks a slightly lower average rating for that team.
  const adjustedOverall = metrics.map(m => m.overall + (m.size - avgSize) * 0.72)

  let repeatPenalty = 0
  let repeatedPairs = 0
  teams.forEach(team => {
    for (let i = 0; i < team.length; i += 1) {
      for (let j = i + 1; j < team.length; j += 1) {
        const repeats = pairCounts.get(pairKey(team[i].id, team[j].id)) || 0
        repeatPenalty += repeats
        if (repeats > 0) repeatedPairs += 1
      }
    }
  })

  let positionPenalty = 0
  teams.forEach(team => {
    const positions = team.map(p => p.rating.preferred_position)
    if (!positions.includes('defense') && !positions.includes('general')) positionPenalty += 1.5
    if (!positions.includes('attack') && !positions.includes('general')) positionPenalty += 1.5
  })

  const objective =
    variance(adjustedOverall) * 13 +
    variance(metrics.map(m => m.attack)) * 3.2 +
    variance(metrics.map(m => m.defense)) * 3.4 +
    variance(metrics.map(m => m.speed)) * 1.4 +
    variance(metrics.map(m => m.goalkeeper)) * 2.3 +
    positionPenalty * 1.6 +
    repeatPenalty * 0.32

  const range = values => Math.max(...values) - Math.min(...values)
  const qualityPenalty =
    range(adjustedOverall) * 6.4 +
    range(metrics.map(m => m.attack)) * 1.4 +
    range(metrics.map(m => m.defense)) * 1.6 +
    range(metrics.map(m => m.goalkeeper)) * 0.7 +
    repeatedPairs * 0.25

  const balanceScore = Math.max(55, Math.min(99, Math.round((100 - qualityPenalty) * 10) / 10))
  return { objective, balanceScore, metrics }
}

function capacitiesFor(count) {
  const base = Math.floor(count / 4)
  const remainder = count % 4
  return [0, 1, 2, 3].map(i => base + (i < remainder ? 1 : 0))
}

function generateBalancedTeams(selectedPlayers, pairCounts) {
  const baseCaps = capacitiesFor(selectedPlayers.length)
  let best = null

  // A randomized search is fast at this scale (normally 16-24 players),
  // requires no paid AI/API, and lets us optimize several constraints together.
  for (let attempt = 0; attempt < 7000; attempt += 1) {
    const caps = shuffled(baseCaps)
    const pool = shuffled(selectedPlayers)
    const teams = TEAM_COLORS.map(() => [])
    let cursor = 0

    caps.forEach((capacity, teamIndex) => {
      for (let i = 0; i < capacity; i += 1) {
        teams[teamIndex].push(pool[cursor])
        cursor += 1
      }
    })

    const evaluation = evaluateTeams(teams, pairCounts)
    if (!best || evaluation.objective < best.evaluation.objective) {
      best = { teams, evaluation }
    }
  }

  return best
}

function RatingEditor({ player, initialRating, onClose, onSaved }) {
  const [form, setForm] = useState({ ...emptyRating, ...(initialRating || {}) })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const overall = overallRating(form)

  async function save() {
    setSaving(true)
    setMessage('')
    const payload = {
      player_id: player.id,
      ...Object.fromEntries(RATING_FIELDS.map(({ key }) => [key, Number(form[key])])),
      preferred_position: form.preferred_position,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('player_ratings').upsert(payload, { onConflict: 'player_id' })
    setSaving(false)
    if (error) setMessage(`שגיאה: ${error.message}`)
    else {
      onSaved(payload)
      onClose()
    }
  }

  return (
    <div className="rating-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="rating-panel card">
        <div className="rating-panel-head">
          <div>
            <span className="eyebrow">מידע פרטי למאמן</span>
            <h2>נתוני שחקן</h2>
          </div>
          <button type="button" className="tb-icon-button" onClick={onClose}>✕</button>
        </div>

        <div className="rating-player-head">
          <img src={player.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName(player))}&background=071426&color=ffffff`} alt="" />
          <div><b>{fullName(player)}</b><small>רמה כללית מחושבת: {overall ?? '—'}</small></div>
        </div>

        <label className="tb-position-field">
          <span>עמדה מועדפת</span>
          <select value={form.preferred_position} onChange={e => setForm({ ...form, preferred_position: e.target.value })}>
            {POSITION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        <div className="rating-sliders">
          {RATING_FIELDS.map(({ key, label }) => (
            <label className="rating-line" key={key}>
              <span>{label}</span>
              <input type="range" min="1" max="10" step="1" value={form[key]} onChange={e => setForm({ ...form, [key]: Number(e.target.value) })} />
              <b>{form[key]}</b>
            </label>
          ))}
        </div>

        {message && <div className="tb-message error-box">{message}</div>}
        <div className="rating-actions">
          <button type="button" className="secondary" onClick={onClose}>ביטול</button>
          <button type="button" className="primary compact" disabled={saving} onClick={save}>{saving ? 'שומר…' : 'שמירת נתונים'}</button>
        </div>
      </div>
    </div>
  )
}

export default function TeamBuilder({ players = [] }) {
  const activePlayers = useMemo(() => players.filter(p => p.is_active), [players])
  const [ratings, setRatings] = useState({})
  const [sessions, setSessions] = useState([])
  const [assignments, setAssignments] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [preferredSize, setPreferredSize] = useState(5)
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState('')
  const [draftTeams, setDraftTeams] = useState(null)
  const [balanceScore, setBalanceScore] = useState(null)
  const [ratingPlayer, setRatingPlayer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function loadPrivateData() {
    setLoading(true)
    const [ratingsRes, sessionsRes] = await Promise.all([
      supabase.from('player_ratings').select('*'),
      supabase.from('training_sessions').select('*').order('session_date', { ascending: false }).order('created_at', { ascending: false }).limit(20),
    ])

    if (ratingsRes.error || sessionsRes.error) {
      setMessage(`שגיאה: ${ratingsRes.error?.message || sessionsRes.error?.message}`)
      setLoading(false)
      return
    }

    const nextSessions = sessionsRes.data || []
    let nextAssignments = []
    if (nextSessions.length) {
      const { data, error } = await supabase.from('training_assignments').select('*').in('session_id', nextSessions.map(s => s.id))
      if (error) setMessage(`שגיאה: ${error.message}`)
      else nextAssignments = data || []
    }

    setRatings(Object.fromEntries((ratingsRes.data || []).map(r => [r.player_id, r])))
    setSessions(nextSessions)
    setAssignments(nextAssignments)
    setLoading(false)
  }

  useEffect(() => { loadPrivateData() }, [])

  const pairCounts = useMemo(() => buildPairCounts(sessions, assignments), [sessions, assignments])
  const selectedPlayers = useMemo(() => selectedIds.map(id => activePlayers.find(p => p.id === id)).filter(Boolean), [selectedIds, activePlayers])
  const visiblePlayers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return activePlayers
    return activePlayers.filter(p => fullName(p).toLowerCase().includes(q))
  }, [activePlayers, search])

  function togglePlayer(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    setDraftTeams(null)
    setBalanceScore(null)
  }

  function generate() {
    setMessage('')
    if (selectedPlayers.length < 8) {
      setMessage('שגיאה: צריך לבחור לפחות 8 שחקנים כדי ליצור 4 קבוצות.')
      return
    }

    const unrated = selectedPlayers.filter(p => !ratingComplete(ratings[p.id]))
    if (unrated.length) {
      setMessage(`שגיאה: חסרים נתוני יכולת ל-${unrated.length} שחקנים. יש להשלים דירוג לפני יצירת הקבוצות.`)
      return
    }

    const enriched = selectedPlayers.map(p => ({ ...p, rating: ratings[p.id], overall: overallRating(ratings[p.id]) }))
    const result = generateBalancedTeams(enriched, pairCounts)
    if (!result) {
      setMessage('שגיאה: לא הצלחנו ליצור חלוקה. נסה שוב.')
      return
    }

    setDraftTeams(Object.fromEntries(TEAM_COLORS.map((team, i) => [team.key, result.teams[i]])))
    setBalanceScore(result.evaluation.balanceScore)
  }

  function recalc(nextTeams) {
    const arrays = TEAM_COLORS.map(t => nextTeams[t.key] || [])
    const result = evaluateTeams(arrays, pairCounts)
    setBalanceScore(result.balanceScore)
  }

  function movePlayer(playerId, targetColor) {
    if (!draftTeams) return
    const next = Object.fromEntries(TEAM_COLORS.map(t => [t.key, [...(draftTeams[t.key] || [])]]))
    let moving = null
    TEAM_COLORS.forEach(t => {
      const index = next[t.key].findIndex(p => p.id === playerId)
      if (index >= 0) moving = next[t.key].splice(index, 1)[0]
    })
    if (moving) next[targetColor].push(moving)
    setDraftTeams(next)
    recalc(next)
  }

  function handleDrop(event, targetColor) {
    event.preventDefault()
    const playerId = event.dataTransfer.getData('text/player-id')
    if (playerId) movePlayer(playerId, targetColor)
  }

  async function confirmTeams() {
    if (!draftTeams) return
    setSaving(true)
    setMessage('')

    const { data: session, error: sessionError } = await supabase.from('training_sessions').insert({
      session_date: sessionDate,
      preferred_team_size: preferredSize,
      selected_count: selectedPlayers.length,
      balance_score: balanceScore,
      status: 'confirmed',
    }).select().single()

    if (sessionError) {
      setSaving(false)
      setMessage(`שגיאה: ${sessionError.message}`)
      return
    }

    const rows = TEAM_COLORS.flatMap(team => (draftTeams[team.key] || []).map((player, index) => ({
      session_id: session.id,
      player_id: player.id,
      team_color: team.key,
      team_position: index + 1,
    })))

    const { error: assignmentError } = await supabase.from('training_assignments').insert(rows)
    if (assignmentError) {
      await supabase.from('training_sessions').delete().eq('id', session.id)
      setSaving(false)
      setMessage(`שגיאה: ${assignmentError.message}`)
      return
    }

    setMessage('החלוקה אושרה ונשמרה בהיסטוריה ✅')
    setSaving(false)
    await loadPrivateData()
  }

  function loadSavedSession(session) {
    const rows = assignments.filter(a => a.session_id === session.id)
    const nextTeams = Object.fromEntries(TEAM_COLORS.map(t => [t.key, []]))
    rows.sort((a, b) => (a.team_position || 0) - (b.team_position || 0)).forEach(row => {
      const player = activePlayers.find(p => p.id === row.player_id)
      if (!player || !nextTeams[row.team_color]) return
      nextTeams[row.team_color].push({ ...player, rating: ratings[player.id], overall: overallRating(ratings[player.id]) })
    })
    setDraftTeams(nextTeams)
    setSelectedIds(rows.map(r => r.player_id))
    setPreferredSize(session.preferred_team_size)
    setSessionDate(session.session_date)
    setBalanceScore(Number(session.balance_score || 0))
    setMessage('נטענה חלוקה שמורה לצפייה. שינויים שתעשה עכשיו לא ישנו את ההיסטוריה עד שתאשר חלוקה חדשה.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const teamSizeText = useMemo(() => {
    if (!selectedPlayers.length) return 'לא נבחרו שחקנים'
    const caps = capacitiesFor(selectedPlayers.length).sort((a, b) => b - a)
    const distinct = [...new Set(caps)]
    const sizes = distinct.length === 1 ? `${distinct[0]} בכל קבוצה` : `${Math.min(...caps)}–${Math.max(...caps)} שחקנים בקבוצה`
    return `${selectedPlayers.length} שחקנים • ${sizes}`
  }, [selectedPlayers.length])

  return (
    <section className="team-builder">
      <div className="section-title tb-title">
        <div><span className="eyebrow">ADMIN • פרטי</span><h1>חלוקת כוחות</h1><p>בחר מי הגיע, הגדר גודל רצוי ויצור חלוקה מאוזנת שלא חוזרת על אותם הרכבים.</p></div>
        <label className="tb-date">תאריך אימון<input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} /></label>
      </div>

      {message && <div className={`tb-message ${message.startsWith('שגיאה') ? 'error-box' : 'status'}`}>{message}</div>}

      <div className="card tb-controls">
        <div>
          <span className="eyebrow">גודל רצוי לקבוצה</span>
          <div className="tb-size-buttons">
            {[4, 5, 6].map(size => <button type="button" className={preferredSize === size ? 'selected' : ''} key={size} onClick={() => setPreferredSize(size)}>{size}</button>)}
          </div>
        </div>
        <div className="tb-selection-summary"><b>{teamSizeText}</b><small>המערכת תמיד מחלקת ל־4 קבוצות: ורוד, כחול, תכלת ולבן.</small></div>
      </div>

      <div className="card tb-attendance">
        <div className="tb-list-head">
          <div><span className="eyebrow">נוכחות ונתוני שחקנים</span><h2>מי הגיע לאימון?</h2></div>
          <input type="search" placeholder="חיפוש שחקן…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? <div className="empty">טוען נתונים…</div> : visiblePlayers.map(player => {
          const rating = ratings[player.id]
          const overall = overallRating(rating)
          const position = POSITION_OPTIONS.find(([value]) => value === rating?.preferred_position)?.[1]
          return (
            <div className={`tb-player-row ${selectedIds.includes(player.id) ? 'selected' : ''}`} key={player.id}>
              <label className="tb-check"><input type="checkbox" checked={selectedIds.includes(player.id)} onChange={() => togglePlayer(player.id)} /><span /></label>
              <img src={player.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName(player))}&background=071426&color=ffffff`} alt="" />
              <div className="tb-player-name"><b>{fullName(player)}</b><small>{position || 'ללא עמדה'}</small></div>
              <div className={`tb-overall ${overall ? '' : 'missing'}`}><b>{overall ?? '—'}</b><small>{overall ? 'רמה כללית' : 'חסר דירוג'}</small></div>
              <button type="button" className="secondary" onClick={() => setRatingPlayer(player)}>נתוני שחקן</button>
            </div>
          )
        })}
      </div>

      <div className="tb-generate-row">
        <button type="button" className="primary tb-generate" onClick={generate}>⚖️ צור חלוקה מאוזנת</button>
      </div>

      {draftTeams && (
        <div className="tb-results">
          <div className="tb-results-head">
            <div><span className="eyebrow">תוצאה</span><h2>חלוקה מאוזנת נוצרה</h2></div>
            <div className="balance-score">⚖️ איזון: <b>{balanceScore}%</b></div>
          </div>

          <div className="tb-team-grid">
            {TEAM_COLORS.map(team => {
              const teamPlayers = draftTeams[team.key] || []
              const avg = teamPlayers.length ? Math.round(average(teamPlayers.map(p => p.overall)) * 10) / 10 : 0
              return (
                <div className={`tb-team-card team-${team.key}`} key={team.key} onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, team.key)}>
                  <div className="tb-team-head"><span>{team.emoji} {team.name}</span><b>{avg || '—'}</b></div>
                  <div className="tb-team-players">
                    {teamPlayers.map(player => (
                      <div className="tb-team-player" draggable onDragStart={e => e.dataTransfer.setData('text/player-id', player.id)} key={player.id}>
                        <img src={player.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName(player))}&background=071426&color=ffffff`} alt="" />
                        <span><b>{fullName(player)}</b><small>{player.overall}</small></span>
                        <select aria-label={`העבר את ${fullName(player)} לקבוצה`} value={team.key} onChange={e => movePlayer(player.id, e.target.value)}>
                          {TEAM_COLORS.map(option => <option key={option.key} value={option.key}>{option.name}</option>)}
                        </select>
                      </div>
                    ))}
                    {!teamPlayers.length && <div className="tb-drop-hint">גרור שחקן לכאן</div>}
                  </div>
                  <div className="tb-team-foot">{teamPlayers.length} שחקנים</div>
                </div>
              )
            })}
          </div>

          <div className="tb-results-actions">
            <button type="button" className="secondary" onClick={generate}>↻ צור חלוקה אחרת</button>
            <button type="button" className="primary compact" disabled={saving} onClick={confirmTeams}>{saving ? 'שומר…' : '✓ אישור ושמירת החלוקה'}</button>
          </div>
        </div>
      )}

      <div className="card tb-history">
        <div className="tb-history-head"><div><span className="eyebrow">היסטוריה</span><h2>חלוקות שאושרו</h2></div><small>משמש גם את האלגוריתם כדי לצמצם הרכבים שחוזרים על עצמם.</small></div>
        {!sessions.length ? <div className="empty">עדיין לא נשמרה חלוקת כוחות.</div> : (
          <div className="tb-history-table">
            <div className="tb-history-row head"><span>תאריך</span><span>שחקנים</span><span>גודל רצוי</span><span>איזון</span><span /></div>
            {sessions.map(session => (
              <div className="tb-history-row" key={session.id}>
                <span>{new Intl.DateTimeFormat('he-IL').format(new Date(`${session.session_date}T12:00:00`))}</span>
                <span>{session.selected_count}</span>
                <span>{session.preferred_team_size}</span>
                <span>{session.balance_score ? `${session.balance_score}%` : '—'}</span>
                <button type="button" className="secondary" onClick={() => loadSavedSession(session)}>צפה</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {ratingPlayer && <RatingEditor player={ratingPlayer} initialRating={ratings[ratingPlayer.id]} onClose={() => setRatingPlayer(null)} onSaved={saved => setRatings(prev => ({ ...prev, [saved.player_id]: saved }))} />}
    </section>
  )
}
