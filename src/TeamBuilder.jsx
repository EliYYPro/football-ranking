import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

export function CoachAvatar() { return <span className="coach-avatar" role="img" aria-label="מאמן — משרוקית"><svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 13H4a2 2 0 0 0-2 2v5h9"/><path d="M12 10h7l3 4a9 9 0 1 1-10-1z"/><circle cx="21" cy="21" r="3"/><circle cx="15" cy="9" r="2"/></svg></span> }

export const TEAM_COLORS = [
  { key: 'pink', name: 'ורוד' },
  { key: 'blue', name: 'כחול' },
  { key: 'cyan', name: 'תכלת' },
  { key: 'white', name: 'לבן' },
  { key: 'yellow', name: 'צהוב' },
]

export const RATING_FIELDS = [
  { key: 'technical', label: 'יכולת טכנית' },
  { key: 'passing', label: 'דיוק' },
  { key: 'speed', label: 'מהירות' },
  { key: 'attack', label: 'התקפה' },
  { key: 'defense', label: 'הגנה' },
  { key: 'physical', label: 'פיזיות' },
  { key: 'game_iq', label: 'חוכמת משחק' },
  { key: 'goalkeeper', label: 'יכולת בשער' },
]

export const POSITION_OPTIONS = [
  ['general', 'כללי'],
  ['goalkeeper', 'שוער'],
  ['defense', 'הגנה'],
  ['midfield', 'קישור'],
  ['attack', 'התקפה'],
]

export const emptyRating = {
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

export function fullName(player) {
  return player?.name || [player?.first_name, player?.last_name].filter(Boolean).join(' ') || 'שחקן'
}

export function ratingComplete(rating) {
  if (!rating) return false
  return RATING_FIELDS.every(({ key }) => Number(rating[key]) >= 1 && Number(rating[key]) <= 10)
}

export function overallRating(rating) {
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

export function ratingLevelClass(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 'rating-missing'
  if (n >= 7.5) return 'rating-elite'
  if (n >= 6.5) return 'rating-strong'
  if (n >= 5.5) return 'rating-medium'
  return 'rating-low'
}

function clampRating(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(10, Math.round(n)))
}

function ratingForGeneration(rating) {
  const source = { ...emptyRating, ...(rating || {}) }
  const normalized = { ...source }
  RATING_FIELDS.forEach(({ key }) => {
    const n = Number(source[key])
    normalized[key] = Number.isFinite(n) && n >= 1 && n <= 10 ? n : 5
  })
  normalized.preferred_position = POSITION_OPTIONS.some(([value]) => value === source.preferred_position)
    ? source.preferred_position
    : 'general'
  return normalized
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
  const recentSessions = sessions.slice(0, 12)
  const weights = new Map(recentSessions.map((s,i) => [s.id, i < 3 ? 3 : i < 6 ? 2 : 1]))
  const recentIds = new Set(weights.keys())
  const grouped = new Map()

  assignments.filter(a => recentIds.has(a.session_id)).forEach(a => {
    const key = `${a.session_id}:${a.team_color}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(a.player_id)
  })

  grouped.forEach((ids, teamKey) => {
    const sessionId = teamKey.split(':')[0]
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = pairKey(ids[i], ids[j])
        counts.set(key, (counts.get(key) || 0) + (weights.get(sessionId) || 1))
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

function evaluateTeams(teams, pairCounts, mode = 'balanced') {
  const metrics = teams.map(teamMetrics)
  const avgSize = average(metrics.map(m => m.size))

  // A team with one extra player has a numerical advantage. We therefore
  // intentionally prefer a slightly lower average ability for that team.
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
    repeatPenalty * (mode === 'variety' ? 2.0 : mode === 'skill' ? 0.08 : 0.55)

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

function capacitiesFor(count, teamCount) {
  const safeTeamCount = Math.max(2, Math.min(4, Number(teamCount) || 4))
  const base = Math.floor(count / safeTeamCount)
  const remainder = count % safeTeamCount
  return Array.from({ length: safeTeamCount }, (_, i) => base + (i < remainder ? 1 : 0))
}

function generateBalancedTeams(selectedPlayers, pairCounts, activeTeams, mode = 'balanced', lockedTeams = {}) {
  if (!Array.isArray(selectedPlayers) || !selectedPlayers.length) return null
  if (!Array.isArray(activeTeams) || activeTeams.length < 2) return null

  const capacities = capacitiesFor(selectedPlayers.length, activeTeams.length)
  const averageCapacity = average(capacities)
  const leagueAverage = average(selectedPlayers.map(p => Number(p.overall || 5)))

  // Build a reliable first draft instead of relying only on thousands of random shuffles.
  // Players are handled from strongest to weakest. Teams with an extra slot are given a
  // slightly lower target average so the numerical advantage is compensated by ability.
  const teams = activeTeams.map(t => [...(lockedTeams[t.key] || [])])
  const lockedIds = new Set(Object.values(lockedTeams).flat().map(p => p.id))
  const ordered = selectedPlayers.filter(p => !lockedIds.has(p.id)).sort((a, b) => Number(b.overall || 5) - Number(a.overall || 5))

  ordered.forEach(player => {
    let bestIndex = -1
    let bestScore = Infinity

    teams.forEach((team, index) => {
      if (team.length >= capacities[index]) return

      const next = [...team, player]
      const targetAverage = leagueAverage - (capacities[index] - averageCapacity) * 0.72
      const projectedAverage = average(next.map(p => Number(p.overall || 5)))
      const repeats = team.reduce((sum, teammate) => sum + (pairCounts.get(pairKey(player.id, teammate.id)) || 0), 0)
      const positions = next.map(p => p.rating?.preferred_position || 'general')
      const duplicatePositionPenalty = positions.filter(pos => pos === player.rating?.preferred_position && pos !== 'general').length > 1 ? 0.08 : 0
      const goalkeeperBoost = player.rating?.preferred_position === 'goalkeeper' && team.some(p => p.rating?.preferred_position === 'goalkeeper') ? 0.35 : 0

      const score =
        Math.abs(projectedAverage - targetAverage) * 2.2 +
        repeats * (mode === 'variety' ? 2.0 : mode === 'skill' ? 0.08 : 0.55) +
        duplicatePositionPenalty +
        goalkeeperBoost +
        team.length * 0.015

      if (score < bestScore) {
        bestScore = score
        bestIndex = index
      }
    })

    // Defensive fallback: there should always be a team with capacity, but if state/data
    // is unusual, place the player in the first available team instead of failing silently.
    if (bestIndex < 0) bestIndex = teams.findIndex((team, index) => team.length < capacities[index])
    if (bestIndex >= 0) teams[bestIndex].push(player)
  })

  if (teams.some((team, index) => team.length !== capacities[index])) {
    // Guaranteed fallback partition. This keeps the button functional even if a future
    // data edge case makes the greedy pass incomplete.
    const fallbackTeams = activeTeams.map(t => [...(lockedTeams[t.key] || [])])
    const pool = [...ordered]
    capacities.forEach((capacity, teamIndex) => {
      fallbackTeams[teamIndex].push(...pool.splice(0, Math.max(0, capacity - fallbackTeams[teamIndex].length)))
    })
    const fallbackEvaluation = evaluateTeams(fallbackTeams, pairCounts, mode)
    return { teams: fallbackTeams, evaluation: fallbackEvaluation }
  }

  let bestTeams = teams.map(team => [...team])
  let bestEvaluation = evaluateTeams(bestTeams, pairCounts, mode)

  // Lightweight local optimization: swap players between teams when the score improves.
  // Much faster and more stable on phones than rebuilding 7,000 complete random drafts.
  for (let attempt = 0; attempt < 650; attempt += 1) {
    const a = Math.floor(Math.random() * bestTeams.length)
    let b = Math.floor(Math.random() * bestTeams.length)
    if (a === b) b = (b + 1) % bestTeams.length
    if (!bestTeams[a].length || !bestTeams[b].length || Object.keys(lockedTeams).includes(activeTeams[a].key) || Object.keys(lockedTeams).includes(activeTeams[b].key)) continue

    const ai = Math.floor(Math.random() * bestTeams[a].length)
    const bi = Math.floor(Math.random() * bestTeams[b].length)
    const candidate = bestTeams.map(team => [...team])
    ;[candidate[a][ai], candidate[b][bi]] = [candidate[b][bi], candidate[a][ai]]

    const evaluation = evaluateTeams(candidate, pairCounts, mode)
    if (evaluation.objective < bestEvaluation.objective) {
      bestTeams = candidate
      bestEvaluation = evaluation
    }
  }

  return { teams: bestTeams, evaluation: bestEvaluation }
}


export function RatingEditor({ player, initialRating, onClose, onSaved = () => {}, readOnly = false }) {
  const [form, setForm] = useState({ ...emptyRating, ...(initialRating || {}) })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const overall = overallRating(form)

  useEffect(() => {
    setForm({ ...emptyRating, ...(initialRating || {}) })
  }, [player?.id, initialRating])

  function setRatingValue(key, value) {
    setForm(prev => ({ ...prev, [key]: clampRating(value) }))
  }

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
            <span className="eyebrow">{readOnly ? 'ADMIN • צפייה בלבד' : 'מידע פרטי למאמן'}</span>
            <h2>נתונים</h2>
          </div>
          <button type="button" className="tb-icon-button" onClick={onClose}>✕</button>
        </div>

        <div className="rating-player-head">
          {isCoach(player) ? <CoachAvatar /> : <img src={player.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName(player))}&background=071426&color=ffffff`} alt="" />}
          <div><b>{fullName(player)}</b><small>רמה כללית מחושבת: {overall ?? '—'}</small></div>
        </div>

        <label className="tb-position-field">
          <span>עמדה מועדפת</span>
          <select disabled={readOnly} value={form.preferred_position} onChange={e => setForm({ ...form, preferred_position: e.target.value })}>
            {POSITION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        <div className="rating-sliders">
          {RATING_FIELDS.map(({ key, label }) => (
            <label className="rating-line" key={key}>
              <span>{label}</span>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                disabled={readOnly}
                value={form[key]}
                onChange={e => setRatingValue(key, e.target.value)}
              />
              <input
                className="rating-number-input"
                type="number"
                min="1"
                max="10"
                step="1"
                disabled={readOnly}
                value={form[key]}
                onChange={e => setRatingValue(key, e.target.value)}
              />
            </label>
          ))}
        </div>

        {message && <div className="tb-message error-box">{message}</div>}
        <div className="rating-actions">
          {readOnly ? (
            <button type="button" className="primary compact" onClick={onClose}>סגור</button>
          ) : (
            <>
              <button type="button" className="secondary" onClick={onClose}>ביטול</button>
              <button type="button" className="primary compact" disabled={saving} onClick={save}>{saving ? 'שומר…' : 'שמירת נתונים'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function TeamHistoryPanel({ players = [] }) {
  const [sessions, setSessions] = useState([])
  const [assignments, setAssignments] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: sessionRows, error: sessionError } = await supabase
        .from('training_sessions')
        .select('*')
        .order('round_number', { ascending: false, nullsFirst: false })
        .order('session_date', { ascending: false })
      if (sessionError) {
        setError(sessionError.message)
        setLoading(false)
        return
      }
      const rows = sessionRows || []
      let assignmentRows = []
      if (rows.length) {
        const { data, error: assignmentError } = await supabase.from('training_assignments').select('*').in('session_id', rows.map(s => s.id))
        if (assignmentError) setError(assignmentError.message)
        else assignmentRows = data || []
      }
      setSessions(rows)
      setAssignments(assignmentRows)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="empty card">טוען היסטוריית חלוקות…</div>
  if (error) return <div className="notice error-box">שגיאה: {error}</div>
  if (!sessions.length) return <div className="empty card">עדיין לא נשמרה חלוקת כוחות.</div>

  return (
    <div className="tb-admin-history-list">
      {sessions.map(session => {
        const rows = assignments.filter(a => a.session_id === session.id)
        return (
          <article className="card tb-admin-history-card" key={session.id}>
            <button type="button" className="tb-admin-history-summary" onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}>
              <span><b>מחזור {session.round_number || '—'}</b><small>{new Intl.DateTimeFormat('he-IL').format(new Date(`${session.session_date}T12:00:00`))}</small></span>
              <span>{session.selected_count} שחקנים</span>
              <span>יעד {session.preferred_team_size} לקבוצה</span>
              <span>{session.balance_score ? `${session.balance_score}% איזון` : '—'}</span>
              <span>{expandedId === session.id ? '▲' : '▼'}</span>
            </button>
            {expandedId === session.id && (
              <div className="tb-archive-team-grid">
                {TEAM_COLORS.filter(team => rows.some(r => r.team_color === team.key)).map(team => (
                  <div className={`tb-archive-team team-${team.key}`} key={team.key}>
                    <b>{team.name}</b>
                    {rows.filter(r => r.team_color === team.key).sort((a, b) => (a.team_position || 0) - (b.team_position || 0)).map(row => {
                      const player = players.find(p => p.id === row.player_id)
                      return <span key={row.player_id}>{player ? fullName(player) : 'שחקן'}</span>
                    })}
                  </div>
                ))}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

const isCoach = (p) => String(p?.name || '').trim().replace(/\s+/g, ' ') === 'דניאל לשר'
export const hasTeamDraft = () => { try { const d = JSON.parse(sessionStorage.getItem('football-team-draft') || '{}'); return Boolean(d.editingSessionId || (d.draftTeams && Object.keys(d.draftTeams).length) || (d.selectedIds && d.selectedIds.length)) } catch { return false } }
const readDraft = () => {
  try {
    // Only resume a draft after an explicit tab switch, not on a fresh visit or reload.
    const resume = sessionStorage.getItem('football-resume-team-draft') === 'yes'
    sessionStorage.removeItem('football-resume-team-draft')
    if (!resume) { sessionStorage.removeItem('football-team-draft'); return {} }
    return JSON.parse(sessionStorage.getItem('football-team-draft') || '{}')
  } catch { return {} }
}
export default function TeamBuilder({ players = [], rounds = [] }) {
  const [initialDraft] = useState(readDraft)
  const activePlayers = useMemo(() => players.filter(p => p.is_active).sort((a,b) => Number(isCoach(a)) - Number(isCoach(b)) || String(a.name).localeCompare(String(b.name),'he')), [players])
  const [ratings, setRatings] = useState({})
  const [sessions, setSessions] = useState([])
  const [assignments, setAssignments] = useState([])
  const [selectedIds, setSelectedIds] = useState(initialDraft.selectedIds || [])
  const [teamCount, setTeamCount] = useState(initialDraft.teamCount || 4)
  const [selectedColorKeys, setSelectedColorKeys] = useState(initialDraft.selectedColorKeys || TEAM_COLORS.slice(0,4).map(t => t.key))
  const [preferredSize, setPreferredSize] = useState(initialDraft.preferredSize || 5)
  const [sessionDate, setSessionDate] = useState(initialDraft.sessionDate || new Date().toISOString().slice(0, 10))
  const [roundNumber, setRoundNumber] = useState(initialDraft.roundNumber || 1)
  const [search, setSearch] = useState('')
  const [attendanceFilter, setAttendanceFilter] = useState('all')
  const [generationMode, setGenerationMode] = useState('balanced')
  const [lockedColorKeys, setLockedColorKeys] = useState([])
  const [undoStack, setUndoStack] = useState([])
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [draftTeams, setDraftTeams] = useState(initialDraft.draftTeams || null)
  const [balanceScore, setBalanceScore] = useState(initialDraft.balanceScore ?? null)
  const [viewRatingPlayer, setViewRatingPlayer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState('')
  const [editingSessionId, setEditingSessionId] = useState(initialDraft.editingSessionId || null)
  useEffect(() => {
    try { sessionStorage.setItem('football-team-draft', JSON.stringify({ selectedIds, teamCount, selectedColorKeys, preferredSize, sessionDate, roundNumber, draftTeams, balanceScore, editingSessionId })) } catch {}
  }, [selectedIds, teamCount, selectedColorKeys, preferredSize, sessionDate, roundNumber, draftTeams, balanceScore, editingSessionId])
  function cancelEdit() { setEditingSessionId(null); setDraftTeams(null); setBalanceScore(null); setSelectedIds([]); setUndoStack([]); setLockedColorKeys([]); setShowConfirmation(false); setMessage('העריכה בוטלה. החלוקה השמורה לא השתנתה.') }

  async function loadPrivateData() {
    setLoading(true)
    const [ratingsRes, sessionsRes] = await Promise.all([
      supabase.from('player_ratings').select('*'),
      supabase.from('training_sessions').select('*').order('round_number', { ascending: false, nullsFirst: false }).order('session_date', { ascending: false }).limit(30),
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

  const nextRoundNumber = useMemo(() => {
    const savedRounds = sessions.map(s => Number(s.round_number || 0))
    const leagueRounds = rounds.map(r => Number(r.round_number || 0))
    return Math.max(0, ...savedRounds, ...leagueRounds) + 1
  }, [sessions, rounds])

  useEffect(() => {
    setRoundNumber(prev => prev === 1 ? nextRoundNumber : prev)
  }, [nextRoundNumber])

  const pairCounts = useMemo(() => buildPairCounts(sessions, assignments), [sessions, assignments])
  const selectedPlayers = useMemo(() => selectedIds.map(id => activePlayers.find(p => p.id === id)).filter(Boolean), [selectedIds, activePlayers])
  const visiblePlayers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return activePlayers.filter(p => (!q || fullName(p).toLowerCase().includes(q)) && (attendanceFilter === 'all' || (attendanceFilter === 'selected' ? selectedIds.includes(p.id) : !selectedIds.includes(p.id))))
  }, [activePlayers, search, attendanceFilter, selectedIds])

  const activeTeamDefs = useMemo(() => TEAM_COLORS.filter(t => selectedColorKeys.includes(t.key)).slice(0, teamCount), [selectedColorKeys, teamCount])
  const desiredTotal = preferredSize * teamCount
  const actualCaps = capacitiesFor(selectedPlayers.length, teamCount)
  const extraVsTarget = selectedPlayers.length - desiredTotal

  function pushUndo() { setUndoStack(prev => [...prev.slice(-19), { draftTeams, selectedColorKeys, balanceScore, lockedColorKeys, selectedIds }]) }
  function undoLast() {
    const previous = undoStack[undoStack.length - 1]
    if (!previous) return
    setDraftTeams(previous.draftTeams); setSelectedColorKeys(previous.selectedColorKeys); setBalanceScore(previous.balanceScore); setLockedColorKeys(previous.lockedColorKeys); setSelectedIds(previous.selectedIds)
    setUndoStack(prev => prev.slice(0, -1))
  }

  function changeTeamCount(nextCount) {
    const count = Number(nextCount)
    setTeamCount(count)
    setSelectedColorKeys(prev => {
      const kept = TEAM_COLORS.filter(t => prev.includes(t.key)).map(t => t.key).slice(0, count)
      const missing = TEAM_COLORS.map(t => t.key).filter(key => !kept.includes(key))
      return [...kept, ...missing.slice(0, Math.max(0, count - kept.length))]
    })
    setDraftTeams(null)
    setBalanceScore(null)
    setEditingSessionId(null)
  }

  function changeDraftTeamColor(oldKey, newKey) {
    if (oldKey === newKey || !draftTeams) return
    if (selectedColorKeys.includes(newKey)) {
      setMessage('הצבע הזה כבר בשימוש בקבוצה אחרת. בחר צבע שאינו בשימוש.')
      return
    }
    pushUndo()
    setDraftTeams(prev => {
      if (!prev) return prev
      const next = { ...prev, [newKey]: prev[oldKey] || [] }
      delete next[oldKey]
      return next
    })
    setSelectedColorKeys(prev => prev.map(key => key === oldKey ? newKey : key))
    setMessage('צבע הקבוצה עודכן. הרכב השחקנים נשאר ללא שינוי.')
  }

  function toggleTeamColor(key) {
    setSelectedColorKeys(prev => {
      if (prev.includes(key)) return prev.filter(x => x !== key)
      if (prev.length >= teamCount) return prev
      return [...prev, key]
    })
    setDraftTeams(null)
    setBalanceScore(null)
  }

  function togglePlayer(id) {
    pushUndo()
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    setDraftTeams(null)
    setBalanceScore(null)
  }

  async function generate() {
    setMessage('')
    setGenerating(true)

    // Give React one frame to show the loading state before the balancing loop starts.
    await new Promise(resolve => setTimeout(resolve, 0))

    try {
      if (activeTeamDefs.length !== teamCount) {
        setMessage(`שגיאה: צריך לבחור בדיוק ${teamCount} צבעי קבוצות.`)
        return
      }

      if (selectedPlayers.length < teamCount) {
        setMessage(`שגיאה: צריך לבחור לפחות ${teamCount} שחקנים כדי ליצור ${teamCount} קבוצות.`)
        return
      }

      // Missing/partial ratings should never make the button look broken.
      // For balancing only, unrated players receive a neutral temporary rating of 5.
      const unrated = selectedPlayers.filter(p => !ratingComplete(ratings[p.id]))
      const enriched = selectedPlayers.map(p => {
        const safeRating = ratingForGeneration(ratings[p.id])
        return { ...p, rating: safeRating, overall: overallRating(safeRating) ?? 5 }
      })

      const lockedTeams = Object.fromEntries(lockedColorKeys.filter(key => draftTeams?.[key]).map(key => [key, draftTeams[key]]))
      const result = generateBalancedTeams(enriched, pairCounts, activeTeamDefs, generationMode, lockedTeams)
      if (!result) {
        setMessage('שגיאה: לא הצלחנו ליצור חלוקה. נסה שוב.')
        return
      }

      if (draftTeams) pushUndo()
      setDraftTeams(Object.fromEntries(activeTeamDefs.map((team, i) => [team.key, result.teams[i]])))
      setBalanceScore(result.evaluation.balanceScore)

      if (unrated.length) {
        const names = unrated.slice(0, 3).map(fullName).join(', ')
        const more = unrated.length > 3 ? ` ועוד ${unrated.length - 3}` : ''
        setMessage(`שים לב: ל-${unrated.length} שחקנים חסרים נתונים מלאים (${names}${more}). לצורך החלוקה בלבד הם חושבו זמנית ברמה 5.0. מומלץ להשלים להם נתונים בניהול שחקנים.`)
      }
    } catch (err) {
      console.error('Team generation failed', err)
      setMessage(`שגיאה ביצירת החלוקה: ${err?.message || 'אירעה תקלה לא צפויה.'}`)
    } finally {
      setGenerating(false)
    }
  }

  function recalc(nextTeams) {
    const arrays = activeTeamDefs.map(t => nextTeams[t.key] || [])
    const result = evaluateTeams(arrays, pairCounts)
    setBalanceScore(result.balanceScore)
  }

  function movePlayer(playerId, targetColor) {
    if (!draftTeams) return
    if (lockedColorKeys.includes(targetColor) || activeTeamDefs.some(t => lockedColorKeys.includes(t.key) && (draftTeams[t.key] || []).some(p => p.id === playerId))) { setMessage('הקבוצה נעולה. פתח את הנעילה לפני העברת שחקנים.'); return }
    pushUndo()
    const next = Object.fromEntries(activeTeamDefs.map(t => [t.key, [...(draftTeams[t.key] || [])]]))
    let moving = null
    activeTeamDefs.forEach(t => {
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

  function validateTeams() {
    if (!draftTeams) return 'לא נוצרה חלוקה.'
    if (activeTeamDefs.length !== teamCount) return 'מספר צבעי הקבוצות אינו תואם.'
    const ids = activeTeamDefs.flatMap(team => (draftTeams[team.key] || []).map(p => p.id))
    if (ids.length !== selectedIds.length || new Set(ids).size !== ids.length || selectedIds.some(id => !ids.includes(id))) return 'חסרים שחקנים או שיש שחקן שמופיע ביותר מקבוצה אחת.'
    if (activeTeamDefs.some(team => !draftTeams[team.key]?.length)) return 'אחת הקבוצות ריקה.'
    return ''
  }
  async function confirmTeams() {
    const validation = validateTeams()
    if (validation) { setMessage(`שגיאה: ${validation}`); setShowConfirmation(false); return }
    if (!showConfirmation) { setShowConfirmation(true); return }
    if (!draftTeams) return
    setSaving(true)
    setMessage('')

    const number = Number(roundNumber)
    if (!number || number < 1) {
      setSaving(false)
      setMessage('שגיאה: מספר המחזור אינו תקין.')
      return
    }
    if (activeTeamDefs.length !== teamCount) {
      setSaving(false)
      setMessage(`שגיאה: צריך לבחור בדיוק ${teamCount} צבעי קבוצות.`)
      return
    }

    let duplicateQuery = supabase.from('training_sessions').select('id').eq('round_number', number)
    if (editingSessionId) duplicateQuery = duplicateQuery.neq('id', editingSessionId)
    const { data: duplicate } = await duplicateQuery.maybeSingle()
    if (duplicate) {
      setSaving(false)
      setMessage(`שגיאה: כבר נשמרה חלוקת כוחות למחזור ${number}.`)
      return
    }

    const sessionPayload = {
      round_number: number,
      session_date: sessionDate,
      preferred_team_size: preferredSize,
      team_count: teamCount,
      selected_team_colors: activeTeamDefs.map(t => t.key),
      selected_count: selectedPlayers.length,
      balance_score: balanceScore,
      status: 'confirmed',
    }

    let session = null
    if (editingSessionId) {
      const { data, error } = await supabase.from('training_sessions').update(sessionPayload).eq('id', editingSessionId).select().single()
      if (error) {
        setSaving(false)
        setMessage(`שגיאה: ${error.message}`)
        return
      }
      session = data
      const { error: deleteAssignmentsError } = await supabase.from('training_assignments').delete().eq('session_id', editingSessionId)
      if (deleteAssignmentsError) {
        setSaving(false)
        setMessage(`שגיאה: ${deleteAssignmentsError.message}`)
        return
      }
    } else {
      const { data, error } = await supabase.from('training_sessions').insert(sessionPayload).select().single()
      if (error) {
        setSaving(false)
        setMessage(`שגיאה: ${error.message}`)
        return
      }
      session = data
    }

    const rows = activeTeamDefs.flatMap(team => (draftTeams[team.key] || []).map((player, index) => ({
      session_id: session.id,
      player_id: player.id,
      team_color: team.key,
      team_position: index + 1,
    })))

    const { error: assignmentError } = await supabase.from('training_assignments').insert(rows)
    if (assignmentError) {
      setSaving(false)
      setMessage(`שגיאה: ${assignmentError.message}`)
      return
    }

    const wasEditing = Boolean(editingSessionId)
    setMessage(wasEditing ? `חלוקת מחזור ${number} עודכנה בהצלחה ✅` : `חלוקת מחזור ${number} אושרה ונשמרה בהיסטוריה ✅`)
    setSaving(false)
    setDraftTeams(null)
    setBalanceScore(null)
    setSelectedIds([])
    setEditingSessionId(null)
    setShowConfirmation(false)
    setUndoStack([])
    setLockedColorKeys([])
    try { sessionStorage.removeItem('football-team-draft') } catch {}
    await loadPrivateData()
    if (!wasEditing) setRoundNumber(number + 1)
  }

  async function deleteSavedSession(session) {
    if (!window.confirm(`למחוק את חלוקת מחזור ${session.round_number || '—'}? הפעולה אינה הפיכה.`)) return
    const { error } = await supabase.from('training_sessions').delete().eq('id', session.id)
    if (error) {
      setMessage(`שגיאה: ${error.message}`)
      return
    }
    if (editingSessionId === session.id) {
      setEditingSessionId(null)
      setDraftTeams(null)
      setSelectedIds([])
      setBalanceScore(null)
    }
    setMessage(`חלוקת מחזור ${session.round_number || '—'} נמחקה.`)
    await loadPrivateData()
  }

  function loadSavedSession(session) {
    const rows = assignments.filter(a => a.session_id === session.id)
    const savedColors = TEAM_COLORS.filter(t => rows.some(r => r.team_color === t.key)).map(t => t.key)
    const savedTeamCount = Number(session.team_count || savedColors.length || 4)
    const finalColors = savedColors.length ? savedColors : TEAM_COLORS.slice(0, savedTeamCount).map(t => t.key)
    const nextTeams = Object.fromEntries(finalColors.map(key => [key, []]))
    rows.sort((a, b) => (a.team_position || 0) - (b.team_position || 0)).forEach(row => {
      const player = activePlayers.find(p => p.id === row.player_id)
      if (!player || !nextTeams[row.team_color]) return
      nextTeams[row.team_color].push({ ...player, rating: ratings[player.id], overall: overallRating(ratings[player.id]) })
    })
    setDraftTeams(nextTeams)
    setSelectedIds(rows.map(r => r.player_id))
    setTeamCount(savedTeamCount)
    setSelectedColorKeys(finalColors)
    setPreferredSize(session.preferred_team_size)
    setSessionDate(session.session_date)
    setRoundNumber(session.round_number || nextRoundNumber)
    setBalanceScore(Number(session.balance_score || 0))
    setEditingSessionId(session.id)
    setLockedColorKeys([]); setUndoStack([]); setShowConfirmation(false)
    setMessage(`חלוקת מחזור ${session.round_number || '—'} נטענה לעריכה. לאחר השינויים לחץ על אישור ושמירה.`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }


  return (
    <section className="team-builder">
      <div className="section-title tb-title">
        <div><span className="eyebrow">ADMIN • פרטי</span><h1>חלוקת כוחות</h1><p>בחר מי הגיע, קבע כמות קבוצות וכמות שחקנים פר קבוצה, בחר צבעי חולצות וצור חלוקה מאוזנת.</p></div>
      </div>

      {message && <div className={`tb-message ${message.startsWith('שגיאה') ? 'error-box' : 'status'}`}>{message}</div>}

      <div className="card tb-round-setup">
        <div><span className="eyebrow">שלב 1</span><h2>מחזור ותאריך</h2><p>מספר המחזור הבא נשמר לפי ההיסטוריה ולא חוזר אחורה.</p></div>
        <div className="tb-round-fields">
          <label className="tb-round-number-label">מספר מחזור<div className="tb-round-stepper" role="group" aria-label="בחירת מספר מחזור"><button type="button" aria-label="מחזור קודם" disabled={Number(roundNumber) <= 1} onClick={() => setRoundNumber(n => Math.max(1, (Number(n) || 1) - 1))}>‹</button><span aria-live="polite">{roundNumber}</span><button type="button" aria-label="מחזור הבא" onClick={() => setRoundNumber(n => (Number(n) || 0) + 1)}>›</button></div></label>
          <label>תאריך<input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} /></label>
        </div>
      </div>

      <div className="card tb-attendance">
        <div className="tb-list-head">
          <div><span className="eyebrow">שלב 2</span><h2>מי הגיע לאימון?</h2></div>
          <input type="search" placeholder="חיפוש שחקן…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="tb-attendance-toolbar"><span className="tb-attendance-toolbar-title">הצג שחקנים</span><div className="tb-filter-buttons tb-attendance-filters">{[['all','כולם'],['selected','סומנו'],['unselected','לא סומנו']].map(([key,label]) => <button type="button" key={key} className={attendanceFilter === key ? 'active' : ''} onClick={() => setAttendanceFilter(key)}>{label}{key === 'selected' ? ` (${selectedIds.length})` : ''}</button>)}</div></div>
        {loading ? <div className="empty">טוען נתונים…</div> : visiblePlayers.map(player => {
          const rating = ratings[player.id]
          const overall = overallRating(rating)
          const position = POSITION_OPTIONS.find(([value]) => value === rating?.preferred_position)?.[1]
          const selectionIndex = selectedIds.indexOf(player.id) + 1
          return (
            <div className={`tb-player-row ${selectedIds.includes(player.id) ? 'selected' : ''} ${isCoach(player) ? 'coach-row' : ''}`} key={player.id} onClick={() => togglePlayer(player.id)}>
              <label className="tb-check" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(player.id)} onChange={() => togglePlayer(player.id)} /><span /></label>
              <span className={`tb-selection-order ${selectionIndex ? 'visible' : ''}`}>{selectionIndex || ''}</span>
              {isCoach(player) ? <CoachAvatar /> : <img src={player.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName(player))}&background=071426&color=ffffff`} alt="" />}
              <div className="tb-player-name"><b>{fullName(player)}</b><small>{isCoach(player) ? 'מאמן • לפי הצורך' : position || 'ללא עמדה'}</small></div>
              <div className={`tb-overall ${ratingLevelClass(overall)}`}><b>{overall ?? '—'}</b><small>{overall ? 'רמה כללית' : 'חסר דירוג'}</small></div>
              <button type="button" className="secondary" onClick={e => { e.stopPropagation(); setViewRatingPlayer(player) }}>צפייה בנתונים 🔒</button>
            </div>
          )
        })}
      </div>

      <div className="tb-mobile-attendance"><b>נבחרו {selectedIds.length} שחקנים</b><button type="button" onClick={() => document.querySelector('.tb-controls-after-attendance')?.scrollIntoView({behavior:'smooth'})}>המשך לחלוקה ↓</button></div>
      <div className="tb-attendance-total" role="status">סה״כ סומנו עד עכשיו <strong>{selectedPlayers.length}</strong> שחקנים</div>
      <div className="card tb-controls tb-controls-after-attendance">
        <div>
          <span className="eyebrow">שלב 3</span>
          <h2>כמות קבוצות</h2>
          <div className="tb-size-buttons tb-team-count-buttons">
            {[2, 3, 4].map(count => <button type="button" className={teamCount === count ? 'selected' : ''} key={count} onClick={() => changeTeamCount(count)}>{count}</button>)}
          </div>
        </div>
        <div className="tb-selection-summary">
          <b>נבחרו {selectedPlayers.length} שחקנים</b>
          <span>{teamCount} קבוצות במשחק</span>
        </div>
      </div>

      <div className="card tb-controls tb-controls-after-attendance">
        <div>
          <span className="eyebrow">שלב 4</span>
          <h2>כמות שחקנים פר קבוצה</h2>
          <div className="tb-size-buttons">
            {[4, 5, 6].map(size => <button type="button" className={preferredSize === size ? 'selected' : ''} key={size} onClick={() => { setPreferredSize(size); setDraftTeams(null); setBalanceScore(null) }}>{size}</button>)}
          </div>
        </div>
        <div className="tb-selection-summary">
          <b>נבחרו {selectedPlayers.length} שחקנים</b>
          <span>יעד: {teamCount} קבוצות × {preferredSize} = {desiredTotal} שחקנים</span>
          <small>בפועל לפי הנוכחות: {actualCaps.join(' / ')} שחקנים בקבוצות</small>
          {extraVsTarget > 0 && <em>יש {extraVsTarget} שחקני אקסטרה — הקבוצות הגדולות יקבלו ממוצע יכולת נמוך יותר.</em>}
          {extraVsTarget < 0 && <em>חסרים {Math.abs(extraVsTarget)} שחקנים ליעד שבחרת; עדיין אפשר ליצור חלוקה לפי מי שהגיע.</em>}
          {extraVsTarget === 0 && selectedPlayers.length > 0 && <em className="ready">הכמות מתאימה בדיוק ליעד ✅</em>}
        </div>
      </div>

      <div className="card tb-color-step">
        <div>
          <span className="eyebrow">שלב 5</span>
          <h2>בחירת צבעי חולצות</h2>
          <p>בחר בדיוק {teamCount} צבעים מתוך חמשת צבעי המדים.</p>
        </div>
        <div className="tb-color-buttons">
          {TEAM_COLORS.map(team => {
            const selected = selectedColorKeys.includes(team.key)
            return <button type="button" key={team.key} className={`team-${team.key} ${selected ? 'selected' : ''}`} onClick={() => toggleTeamColor(team.key)}>{team.name}</button>
          })}
        </div>
        <small className="tb-color-hint">נבחרו {selectedColorKeys.length} מתוך {teamCount}</small>
      </div>

      <div className="card tb-mode-selector"><b>מצב חלוקה</b><div className="tb-filter-buttons">{[['balanced','מאוזן ומשולב'],['skill','איזון מקסימלי'],['variety','גיוון מקסימלי']].map(([key,label]) => <button type="button" key={key} className={generationMode === key ? 'active' : ''} onClick={() => setGenerationMode(key)}>{label}</button>)}</div></div>
      <div className="tb-generate-row">
        <button type="button" className="primary tb-generate" disabled={generating} onClick={() => void generate()}>{generating ? 'מחשב חלוקה…' : '⚖️ צור חלוקה מאוזנת'}</button>
        <small className={`tb-generate-readiness ${(selectedPlayers.length >= teamCount && activeTeamDefs.length === teamCount) ? 'ready' : ''}`}>
          {selectedPlayers.length < teamCount
            ? `בחר לפחות ${teamCount} שחקנים כדי ליצור ${teamCount} קבוצות.`
            : activeTeamDefs.length !== teamCount
              ? `בחר בדיוק ${teamCount} צבעי חולצות.`
              : `מוכן לחלוקה: ${selectedPlayers.length} שחקנים • ${teamCount} קבוצות • ${activeTeamDefs.map(t => t.name).join(', ')}`}
        </small>
      </div>

      {draftTeams && (
        <div className="tb-results">
          <div className="tb-results-head">
            <div><span className="eyebrow">תוצאה</span><h2>חלוקה מאוזנת נוצרה</h2></div>
            <div className="balance-score">⚖️ איזון: <b>{balanceScore}%</b></div>
          </div>

          <div className="tb-team-grid">
            {activeTeamDefs.map(team => {
              const teamPlayers = draftTeams[team.key] || []
              const avg = teamPlayers.length ? Math.round(average(teamPlayers.map(p => p.overall)) * 10) / 10 : 0
              return (
                <div className={`tb-team-card team-${team.key}`} key={team.key} onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, team.key)}>
                  <div className="tb-team-head"><button type="button" className="tb-lock-button" aria-pressed={lockedColorKeys.includes(team.key)} onClick={() => setLockedColorKeys(prev => prev.includes(team.key) ? prev.filter(k => k !== team.key) : [...prev, team.key])}>{lockedColorKeys.includes(team.key) ? '🔒 נעולה' : '🔓 נעילה'}</button><label className="tb-team-color-label"><span className="sr-only">צבע הקבוצה</span><select aria-label="שינוי צבע הקבוצה" value={team.key} onChange={e => changeDraftTeamColor(team.key, e.target.value)}>{TEAM_COLORS.map(option => <option key={option.key} value={option.key} disabled={option.key !== team.key && selectedColorKeys.includes(option.key)}>{option.name}</option>)}</select></label><b>{avg || '—'}</b></div>
                  <div className="tb-team-players">
                    {teamPlayers.map(player => (
                      <div className="tb-team-player" draggable onDragStart={e => e.dataTransfer.setData('text/player-id', player.id)} key={player.id}>
                        {isCoach(player) ? <CoachAvatar /> : <img src={player.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName(player))}&background=071426&color=ffffff`} alt="" />}
                        <span><b>{fullName(player)}</b><small>{player.overall}</small></span>
                        <select aria-label={`העבר את ${fullName(player)} לקבוצה`} value={team.key} onChange={e => movePlayer(player.id, e.target.value)}>
                          {activeTeamDefs.map(option => <option key={option.key} value={option.key}>{option.name}</option>)}
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
            <button type="button" className="secondary" disabled={!undoStack.length} onClick={undoLast}>↶ בטל פעולה אחרונה</button>
            {editingSessionId && <button type="button" className="secondary" disabled={saving} onClick={cancelEdit}>ביטול עריכה</button>}
            <button type="button" className="secondary" disabled={generating} onClick={generate}>{generating ? 'מחשב…' : '↻ צור חלוקה אחרת'}</button>
            <button type="button" className="primary compact" disabled={saving} onClick={confirmTeams}>{saving ? 'שומר…' : editingSessionId ? '✓ שמירת השינויים' : '✓ אישור ושמירת החלוקה'}</button>
          </div>
          {showConfirmation && <div className="card tb-confirm-summary" role="dialog" aria-label="אישור חלוקה"><h3>סיכום לפני שמירה</h3><p>מחזור {roundNumber} · {sessionDate} · {selectedIds.length} שחקנים · {teamCount} קבוצות</p><p>{activeTeamDefs.map(t => `${t.name}: ${draftTeams[t.key]?.length || 0}`).join(' | ')}</p><p>קבוצות עם שחקן נוסף מותרות כאשר מספר השחקנים אינו מתחלק באופן שווה.</p><button type="button" className="secondary" onClick={() => setShowConfirmation(false)}>חזרה לעריכה</button> <button type="button" className="primary compact" onClick={confirmTeams} disabled={saving}>{saving ? 'שומר…' : 'אשר ושמור סופית'}</button></div>}
        </div>
      )}

      <div className="card tb-history">
        <div className="tb-history-head"><div><span className="eyebrow">היסטוריה</span><h2>חלוקות ממחזורים קודמים</h2></div><small>המערכת משתמשת בהיסטוריה כדי לצמצם חזרה על אותם הרכבים.</small></div>
        {!sessions.length ? <div className="empty">עדיין לא נשמרה חלוקת כוחות.</div> : (
          <div className="tb-history-table">
            <div className="tb-history-row head"><span>מחזור</span><span>תאריך</span><span>שחקנים</span><span>קבוצות</span><span>איזון</span><span>פעולות</span></div>
            {sessions.map(session => (
              <div className="tb-history-row" key={session.id}>
                <span>{session.round_number || '—'}</span>
                <span>{new Intl.DateTimeFormat('he-IL').format(new Date(`${session.session_date}T12:00:00`))}</span>
                <span>{session.selected_count}</span>
                <span>{session.team_count || new Set(assignments.filter(a => a.session_id === session.id).map(a => a.team_color)).size || 4}</span>
                <span>{session.balance_score ? `${session.balance_score}%` : '—'}</span>
                <span className="tb-history-actions">
                  <button type="button" className="secondary" onClick={() => loadSavedSession(session)}>ערוך</button>
                  <button type="button" className="danger soft" onClick={() => deleteSavedSession(session)}>מחק</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewRatingPlayer && (
        <RatingEditor
          player={viewRatingPlayer}
          initialRating={ratings[viewRatingPlayer.id]}
          readOnly
          onClose={() => setViewRatingPlayer(null)}
        />
      )}
    </section>
  )
}
