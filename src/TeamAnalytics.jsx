import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { TEAM_COLORS, fullName } from './TeamBuilder'

const avatarFallback = (name = 'Player') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=071426&color=ffffff&size=128&bold=true`

const formatDate = (date) => {
  if (!date) return '—'
  try {
    return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${date}T12:00:00`))
  } catch {
    return date
  }
}

function pairKey(a, b) {
  return [a, b].sort().join('|')
}

function buildAnalytics(sessions, assignments, players) {
  const playerMap = new Map(players.map(p => [p.id, p]))
  const sessionMap = new Map(sessions.map(s => [s.id, s]))
  const appearances = new Map()
  const colorCounts = new Map()
  const pairCounts = new Map()
  const pairLastRound = new Map()
  const sessionPlayerSets = new Map()

  assignments.forEach(row => {
    appearances.set(row.player_id, (appearances.get(row.player_id) || 0) + 1)
    if (!colorCounts.has(row.player_id)) colorCounts.set(row.player_id, new Map())
    const perColor = colorCounts.get(row.player_id)
    perColor.set(row.team_color, (perColor.get(row.team_color) || 0) + 1)

    const teamKey = `${row.session_id}:${row.team_color}`
    if (!sessionPlayerSets.has(teamKey)) sessionPlayerSets.set(teamKey, [])
    sessionPlayerSets.get(teamKey).push(row.player_id)
  })

  sessionPlayerSets.forEach((ids, teamKey) => {
    const sessionId = teamKey.split(':')[0]
    const roundNumber = Number(sessionMap.get(sessionId)?.round_number || 0)
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = pairKey(ids[i], ids[j])
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1)
        pairLastRound.set(key, Math.max(pairLastRound.get(key) || 0, roundNumber))
      }
    }
  })

  const pairs = [...pairCounts.entries()].map(([key, count]) => {
    const [aId, bId] = key.split('|')
    return {
      key,
      aId,
      bId,
      a: playerMap.get(aId),
      b: playerMap.get(bId),
      count,
      lastRound: pairLastRound.get(key) || 0,
    }
  }).filter(pair => pair.a && pair.b).sort((a, b) => b.count - a.count || b.lastRound - a.lastRound)

  const playerStats = players.map(player => {
    const teammateRows = pairs
      .filter(pair => pair.aId === player.id || pair.bId === player.id)
      .map(pair => ({
        player: pair.aId === player.id ? pair.b : pair.a,
        count: pair.count,
        lastRound: pair.lastRound,
      }))
      .sort((a, b) => b.count - a.count || String(fullName(a.player)).localeCompare(fullName(b.player), 'he'))

    return {
      player,
      appearances: appearances.get(player.id) || 0,
      uniqueTeammates: teammateRows.length,
      teammates: teammateRows,
      colors: colorCounts.get(player.id) || new Map(),
    }
  }).sort((a, b) => b.appearances - a.appearances || String(fullName(a.player)).localeCompare(fullName(b.player), 'he'))

  return { pairs, playerStats, playerMap }
}

export default function TeamAnalytics({ players = [] }) {
  const [sessions, setSessions] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [range, setRange] = useState('all')
  const [selectedPlayerId, setSelectedPlayerId] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      const [sessionsRes, assignmentsRes] = await Promise.all([
        supabase.from('training_sessions').select('*').eq('status', 'confirmed').order('round_number', { ascending: false, nullsFirst: false }).order('session_date', { ascending: false }),
        supabase.from('training_assignments').select('*'),
      ])

      if (sessionsRes.error || assignmentsRes.error) {
        setError(sessionsRes.error?.message || assignmentsRes.error?.message || 'שגיאה בטעינת הנתונים')
        setSessions([])
        setAssignments([])
      } else {
        setSessions(sessionsRes.data || [])
        setAssignments(assignmentsRes.data || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const filteredSessions = useMemo(() => {
    if (range === '5') return sessions.slice(0, 5)
    if (range === '10') return sessions.slice(0, 10)
    return sessions
  }, [sessions, range])

  const filteredAssignments = useMemo(() => {
    const ids = new Set(filteredSessions.map(s => s.id))
    return assignments.filter(a => ids.has(a.session_id))
  }, [filteredSessions, assignments])

  const analytics = useMemo(
    () => buildAnalytics(filteredSessions, filteredAssignments, players),
    [filteredSessions, filteredAssignments, players]
  )

  useEffect(() => {
    if (!selectedPlayerId && analytics.playerStats.length) {
      setSelectedPlayerId(analytics.playerStats[0].player.id)
    } else if (selectedPlayerId && !analytics.playerStats.some(x => x.player.id === selectedPlayerId)) {
      setSelectedPlayerId(analytics.playerStats[0]?.player.id || '')
    }
  }, [analytics.playerStats, selectedPlayerId])

  const selectedStats = analytics.playerStats.find(x => x.player.id === selectedPlayerId) || null
  const averagePlayers = filteredSessions.length ? Math.round((filteredAssignments.length / filteredSessions.length) * 10) / 10 : 0
  const activePlayerCount = analytics.playerStats.filter(x => x.appearances > 0).length
  const topPairs = analytics.pairs.slice(0, 12)

  const colorTotals = useMemo(() => {
    const result = Object.fromEntries(TEAM_COLORS.map(t => [t.key, 0]))
    filteredAssignments.forEach(row => { result[row.team_color] = (result[row.team_color] || 0) + 1 })
    return result
  }, [filteredAssignments])

  const selectedSessions = useMemo(() => {
    if (!selectedPlayerId) return []
    const rowsBySession = new Map()
    filteredAssignments.filter(a => a.player_id === selectedPlayerId).forEach(row => rowsBySession.set(row.session_id, row))
    return filteredSessions.filter(s => rowsBySession.has(s.id)).map(session => {
      const own = rowsBySession.get(session.id)
      const teammates = filteredAssignments
        .filter(a => a.session_id === session.id && a.team_color === own.team_color && a.player_id !== selectedPlayerId)
        .map(a => analytics.playerMap.get(a.player_id))
        .filter(Boolean)
      return { session, color: own.team_color, teammates }
    })
  }, [filteredSessions, filteredAssignments, selectedPlayerId, analytics.playerMap])

  if (loading) return <section className="analytics-page"><div className="empty card">טוען נתונים וסטטיסטיקות…</div></section>

  return (
    <section className="analytics-page">
      <div className="section-title analytics-title">
        <div>
          <span className="eyebrow">ADMIN • פרטי</span>
          <h1>נתונים וסטטיסטיקות</h1>
          <p>ניתוח חלוקות הכוחות שאושרו בפועל: השתתפות, צמדים, צבעי קבוצות והיסטוריה לכל שחקן.</p>
        </div>
        <label className="analytics-range">
          <span>טווח</span>
          <select value={range} onChange={e => setRange(e.target.value)}>
            <option value="all">כל העונה</option>
            <option value="10">10 מחזורים אחרונים</option>
            <option value="5">5 מחזורים אחרונים</option>
          </select>
        </label>
      </div>

      {error && <div className="notice error-box">{error}</div>}

      <div className="analytics-kpis">
        <div className="card analytics-kpi"><span>חלוקות מאושרות</span><b>{filteredSessions.length}</b></div>
        <div className="card analytics-kpi"><span>שחקנים שהשתתפו</span><b>{activePlayerCount}</b></div>
        <div className="card analytics-kpi"><span>ממוצע שחקנים למחזור</span><b>{averagePlayers}</b></div>
        <div className="card analytics-kpi"><span>צמדים ששיחקו יחד</span><b>{analytics.pairs.length}</b></div>
      </div>

      <div className="analytics-grid">
        <div className="card analytics-pairs-card">
          <div className="analytics-card-head">
            <div><span className="eyebrow">חיבורים</span><h2>מי שיחק הכי הרבה עם מי?</h2></div>
            <small>מבוסס רק על החלוקות שאושרו</small>
          </div>
          {!topPairs.length ? <div className="empty">עדיין אין מספיק היסטוריה.</div> : (
            <div className="analytics-pair-list">
              {topPairs.map((pair, index) => (
                <div className="analytics-pair-row" key={pair.key}>
                  <span className="analytics-pair-rank">{index + 1}</span>
                  <span className="analytics-pair-people">
                    <span className="analytics-person"><img src={pair.a.photo_url || avatarFallback(fullName(pair.a))} alt="" /><b>{fullName(pair.a)}</b></span>
                    <span className="pair-plus">+</span>
                    <span className="analytics-person"><img src={pair.b.photo_url || avatarFallback(fullName(pair.b))} alt="" /><b>{fullName(pair.b)}</b></span>
                  </span>
                  <span className="analytics-pair-count"><b>{pair.count}</b><small>פעמים יחד</small></span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card analytics-participation-card">
          <div className="analytics-card-head"><div><span className="eyebrow">נוכחות</span><h2>השתתפות במחזורים</h2></div></div>
          <div className="analytics-participation-list">
            {analytics.playerStats.map(stat => (
              <button type="button" className={selectedPlayerId === stat.player.id ? 'selected' : ''} key={stat.player.id} onClick={() => setSelectedPlayerId(stat.player.id)}>
                <span className="analytics-person"><img src={stat.player.photo_url || avatarFallback(fullName(stat.player))} alt="" /><b>{fullName(stat.player)}</b></span>
                <span><b>{stat.appearances}</b><small>הופעות</small></span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card analytics-player-card">
        <div className="analytics-player-selector">
          <div><span className="eyebrow">שחקן</span><h2>ניתוח אישי</h2></div>
          <select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)}>
            {analytics.playerStats.map(stat => <option key={stat.player.id} value={stat.player.id}>{fullName(stat.player)}</option>)}
          </select>
        </div>

        {!selectedStats ? <div className="empty">בחר שחקן להצגת נתונים.</div> : (
          <>
            <div className="analytics-player-summary">
              <div className="analytics-selected-player">
                <img src={selectedStats.player.photo_url || avatarFallback(fullName(selectedStats.player))} alt="" />
                <div><h3>{fullName(selectedStats.player)}</h3><span>{selectedStats.appearances} הופעות בטווח שנבחר</span></div>
              </div>
              <div className="analytics-mini-kpis">
                <div><b>{selectedStats.uniqueTeammates}</b><span>חברים שונים לקבוצה</span></div>
                <div><b>{selectedStats.teammates[0]?.count || 0}</b><span>מקסימום עם אותו שחקן</span></div>
                <div><b>{selectedSessions.length}</b><span>מחזורים מתועדים</span></div>
              </div>
            </div>

            <div className="analytics-player-columns">
              <div>
                <h3>שחקנים ששיחקו איתו הכי הרבה</h3>
                <div className="analytics-teammates">
                  {!selectedStats.teammates.length ? <div className="empty compact">אין עדיין נתונים.</div> : selectedStats.teammates.slice(0, 12).map((row, index) => (
                    <div key={row.player.id}>
                      <span>{index + 1}</span>
                      <span className="analytics-person"><img src={row.player.photo_url || avatarFallback(fullName(row.player))} alt="" /><b>{fullName(row.player)}</b></span>
                      <strong>{row.count}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3>חלוקה לפי צבע חולצה</h3>
                <div className="analytics-colors">
                  {TEAM_COLORS.map(team => (
                    <div className={`analytics-color team-${team.key}`} key={team.key}>
                      <span>{team.name}</span>
                      <b>{selectedStats.colors.get(team.key) || 0}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="analytics-player-history">
              <h3>מחזורים אחרונים של השחקן</h3>
              {!selectedSessions.length ? <div className="empty compact">אין מחזורים בטווח שנבחר.</div> : selectedSessions.map(row => {
                const team = TEAM_COLORS.find(t => t.key === row.color)
                return (
                  <div className="analytics-player-history-row" key={row.session.id}>
                    <span><b>מחזור {row.session.round_number || '—'}</b><small>{formatDate(row.session.session_date)}</small></span>
                    <span className={`analytics-history-color team-${row.color}`}>{team?.name || row.color}</span>
                    <span className="analytics-history-teammates">{row.teammates.map(fullName).join(', ') || '—'}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div className="card analytics-color-usage">
        <div className="analytics-card-head"><div><span className="eyebrow">כללי</span><h2>שימוש בצבעי הקבוצות</h2></div></div>
        <div className="analytics-colors analytics-colors-wide">
          {TEAM_COLORS.map(team => (
            <div className={`analytics-color team-${team.key}`} key={team.key}>
              <span>{team.name}</span>
              <b>{colorTotals[team.key] || 0}</b>
              <small>שיבוצי שחקנים</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
