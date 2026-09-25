import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import TeamBuilder, { RatingEditor, TeamHistoryPanel, TEAM_COLORS } from './TeamBuilder'
import './styles.css'

const avatarFallback = (name = 'Player') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=071426&color=ffffff&size=256&bold=true`

const formatDate = (date) => {
  if (!date) return ''
  try {
    return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${date}T12:00:00`))
  } catch {
    return date
  }
}

const FOOTER_TEXT = 'טבלת ליגת ותיקי רמת אפעל • עונת 2026/27 • מאמן: דניאל לשר'

const splitPlayerName = (player = {}) => {
  if (player.first_name || player.last_name) {
    return { first: player.first_name || '', last: player.last_name || '' }
  }
  const parts = String(player.name || '').trim().split(/\s+/).filter(Boolean)
  return { first: parts[0] || '', last: parts.slice(1).join(' ') }
}

const joinPlayerName = (first, last) => [first?.trim(), last?.trim()].filter(Boolean).join(' ')

const compareLeaderboard = (a, b) =>
  (Number(b.total_points) - Number(a.total_points)) ||
  (Number(b.total_wins) - Number(a.total_wins)) ||
  String(a.name || '').localeCompare(String(b.name || ''), 'he')

const buildRankMap = (items) => {
  const sorted = [...items].sort(compareLeaderboard)
  return sorted.reduce((acc, item, index) => {
    acc[item.id] = index + 1
    return acc
  }, {})
}

function TrendArrow({ trend }) {
  if (trend === 'up') return <span className="trend-arrow up" title="עלה בדירוג">▲</span>
  if (trend === 'down') return <span className="trend-arrow down" title="ירד בדירוג">▼</span>
  return null
}

function LeagueLogo({ markOnly = false }) {
  return (
    <span className={`league-logo ${markOnly ? 'mark-only' : ''}`}>
      <span className="league-crest" aria-hidden="true">
        <span className="crest-stars">★ ★ ★</span>
        <span className="crest-ring">VRA</span>
        <span className="crest-year">26/27</span>
      </span>
      {!markOnly && (
        <span className="league-wordmark">
          <b>ותיקי רמת אפעל</b>
          <small>VETERANS FOOTBALL LEAGUE</small>
        </span>
      )}
    </span>
  )
}

function Shell({ children }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand"><LeagueLogo /></Link>
        <nav className="topbar-actions">
          <Link to="/archive" className="archive-link">ארכיון</Link>
          <Link to="/admin" className="admin-link">Admin</Link>
        </nav>
      </header>
      {children}
      <footer>{FOOTER_TEXT}</footer>
    </div>
  )
}


function PhotoLightbox({ url, alt = '', onClose }) {
  if (!url) return null
  return (
    <div className="photo-lightbox" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <button type="button" className="photo-lightbox-close" onClick={onClose}>✕</button>
      <img src={url} alt={alt} />
    </div>
  )
}

function PublicArchive() {
  const [mode, setMode] = useState('photos')
  const [rounds, setRounds] = useState([])
  const [sessions, setSessions] = useState([])
  const [assignments, setAssignments] = useState([])
  const [lightbox, setLightbox] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [roundsRes, teamArchiveRes] = await Promise.all([
        supabase.from('rounds').select('id, round_number, round_date, winner_photo_url').order('round_number', { ascending: false }),
        supabase.from('public_team_archive').select('*').order('round_number', { ascending: false, nullsFirst: false }).order('session_date', { ascending: false }),
      ])
      const err = roundsRes.error || teamArchiveRes.error
      if (err) setError(err.message || 'שגיאה בטעינת הארכיון')
      setRounds(roundsRes.data || [])
      const archiveRows = teamArchiveRes.data || []
      const sessionMap = new Map()
      archiveRows.forEach(row => {
        if (!sessionMap.has(row.session_id)) {
          sessionMap.set(row.session_id, {
            id: row.session_id,
            round_number: row.round_number,
            session_date: row.session_date,
            preferred_team_size: row.preferred_team_size,
            selected_count: row.selected_count,
            balance_score: row.balance_score,
          })
        }
      })
      setSessions([...sessionMap.values()])
      setAssignments(archiveRows.map(row => ({
        session_id: row.session_id,
        player_id: row.player_id,
        team_color: row.team_color,
        team_position: row.team_position,
        player: { id: row.player_id, name: row.player_name, photo_url: row.player_photo_url },
      })))
      setLoading(false)
    }
    load()
  }, [])

  return (
    <Shell>
      <main className="page public-archive">
        <div className="archive-page-head">
          <div><span className="eyebrow">ארכיון הליגה</span><h1>מחזורים קודמים</h1><p>תמונות הניצחון וחלוקות הקבוצות שאושרו בפועל.</p></div>
          <div className="archive-tabs">
            <button type="button" className={mode === 'photos' ? 'active' : ''} onClick={() => setMode('photos')}>📸 היסטוריית תמונות ניצחון</button>
            <button type="button" className={mode === 'teams' ? 'active' : ''} onClick={() => setMode('teams')}>⚽ היסטוריית חלוקה לקבוצות</button>
          </div>
        </div>

        {error && <div className="notice error-box">{error}</div>}
        {loading ? <div className="empty card">טוען ארכיון…</div> : mode === 'photos' ? (
          <div className="archive-photo-grid">
            {rounds.filter(r => r.winner_photo_url).length === 0 ? <div className="empty card">עדיין אין תמונות ניצחון בארכיון.</div> : rounds.filter(r => r.winner_photo_url).map(round => (
              <button type="button" className="archive-photo-card card" key={round.id} onClick={() => setLightbox({ url: round.winner_photo_url, alt: `זוכי מחזור ${round.round_number}` })}>
                <img src={round.winner_photo_url} alt={`זוכי מחזור ${round.round_number}`} />
                <span><b>מחזור {round.round_number}</b><small>{formatDate(round.round_date)}</small></span>
              </button>
            ))}
          </div>
        ) : (
          <div className="public-team-history">
            {sessions.length === 0 ? <div className="empty card">עדיין אין חלוקות קבוצות מאושרות.</div> : sessions.map(session => {
              const rows = assignments.filter(a => a.session_id === session.id)
              return (
                <article className="card public-team-session" key={session.id}>
                  <div className="public-team-session-head">
                    <div><span className="eyebrow">מחזור {session.round_number || '—'}</span><h2>{formatDate(session.session_date)}</h2></div>
                    <span>{session.selected_count} שחקנים</span>
                  </div>
                  <div className="public-team-grid">
                    {TEAM_COLORS.map(team => (
                      <div className={`public-team-card team-${team.key}`} key={team.key}>
                        <div className="public-team-card-head">{team.emoji} {team.name}</div>
                        {rows.filter(r => r.team_color === team.key).sort((a,b) => (a.team_position || 0) - (b.team_position || 0)).map(row => (
                          <div className="public-team-player" key={row.player_id}>
                            <img src={row.player?.photo_url || avatarFallback(row.player?.name)} alt="" />
                            <span>{row.player?.name || 'שחקן'}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>
      <PhotoLightbox url={lightbox?.url} alt={lightbox?.alt} onClose={() => setLightbox(null)} />
    </Shell>
  )
}

function usePublicHomeData() {
  const [leaderboard, setLeaderboard] = useState([])
  const [latestRound, setLatestRound] = useState(null)
  const [recentRounds, setRecentRounds] = useState([])
  const [trendMap, setTrendMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')

    const [leadersRes, roundsRes] = await Promise.all([
      supabase.from('leaderboard').select('*'),
      supabase.from('rounds').select('*').order('round_number', { ascending: false }).limit(6),
    ])

    const baseError = leadersRes.error || roundsRes.error
    if (baseError) {
      setError(baseError.message || 'שגיאה בטעינת הנתונים')
      setLeaderboard([])
      setRecentRounds([])
      setLatestRound(null)
      setTrendMap({})
      setLoading(false)
      return
    }

    const leaders = [...(leadersRes.data || [])].sort(compareLeaderboard)
    const rounds = roundsRes.data || []
    const latest = rounds[0] || null
    const nextTrendMap = {}

    if (latest && rounds.length > 1 && leaders.length > 0) {
      const { data: latestResults, error: resultsError } = await supabase
        .from('results')
        .select('player_id, points, won')
        .eq('round_id', latest.id)

      if (resultsError) {
        setError(resultsError.message || 'שגיאה בחישוב שינויי הדירוג')
      } else {
        const latestResultsMap = Object.fromEntries((latestResults || []).map(r => [r.player_id, r]))
        const previousSnapshot = leaders.map(player => {
          const delta = latestResultsMap[player.id]
          return {
            ...player,
            total_points: Number(player.total_points || 0) - Number(delta?.points || 0),
            total_wins: Number(player.total_wins || 0) - (delta?.won ? 1 : 0),
          }
        })

        const currentRankMap = buildRankMap(leaders)
        const previousRankMap = buildRankMap(previousSnapshot)

        leaders.forEach(player => {
          const currentRank = currentRankMap[player.id]
          const previousRank = previousRankMap[player.id]
          if (!currentRank || !previousRank) nextTrendMap[player.id] = 'same'
          else if (currentRank < previousRank) nextTrendMap[player.id] = 'up'
          else if (currentRank > previousRank) nextTrendMap[player.id] = 'down'
          else nextTrendMap[player.id] = 'same'
        })
      }
    }

    setLeaderboard(leaders)
    setRecentRounds(rounds)
    setLatestRound(latest)
    setTrendMap(nextTrendMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  return { leaderboard, latestRound, recentRounds, trendMap, loading, error, reload: load }
}

function Home() {
  const { leaderboard, latestRound, recentRounds, trendMap, loading, error } = usePublicHomeData()
  const [lightbox, setLightbox] = useState(null)

  return (
    <Shell>
      <main className="page">
        <section className="hero">
          <div className="stadium-lights stadium-lights-left" aria-hidden="true" />
          <div className="stadium-lights stadium-lights-right" aria-hidden="true" />
          <div className="hero-copy">
            <div className="hero-kicker">ליגת הכדורגל</div>
            <h1>טבלת ליגת<br />ותיקי רמת אפעל</h1>
            <div className="season-ribbon">עונת 2026/27</div>
            <p>הדירוג מתעדכן אוטומטית אחרי כל מחזור.</p>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-ball"><span>VRA</span></div>
            <div className="hero-crest"><LeagueLogo markOnly /></div>
          </div>
        </section>

        {latestRound?.winner_photo_url && (
          <section className="winner-card card">
            <button type="button" className="winner-photo-button" onClick={() => setLightbox({ url: latestRound.winner_photo_url, alt: `זוכי מחזור ${latestRound.round_number}` })}>
              <img src={latestRound.winner_photo_url} alt={`זוכי מחזור ${latestRound.round_number}`} />
            </button>
            <div className="winner-copy">
              <span className="eyebrow">🏆 זוכי השבוע</span>
              <h2>מחזור {latestRound.round_number}</h2>
              <p>לחץ על התמונה לצפייה בגודל מלא</p>
              <small>{formatDate(latestRound.round_date)}</small>
            </div>
          </section>
        )}

        {error && <div className="notice error-box">{error}</div>}

        {loading ? (
          <section className="card leaderboard"><div className="empty">טוען טבלה…</div></section>
        ) : leaderboard.length === 0 ? (
          <section className="card leaderboard"><div className="empty">עדיין אין שחקנים בטבלה.</div></section>
        ) : (
          <>
            <section className="top-three-section">
              <div className="top-three-heading">
                <div>
                  <span className="eyebrow">הפודיום</span>
                  <h2>שלושת המובילים</h2>
                </div>
                <span className="top-three-note">מתעדכן אוטומטית לפי הניקוד</span>
              </div>
              <div className="top-three">
                {leaderboard.slice(0, 3).map((p, i) => (
                  <Link to={`/player/${p.id}`} className={`top-player-card top-${i + 1}`} key={p.id}>
                    <span className="top-rank">{i + 1}</span>
                    <span className="medal">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                    <img src={p.photo_url || avatarFallback(p.name)} alt={p.name} />
                    <div className="top-player-name"><span className="name-with-trend"><b>{p.name}</b><TrendArrow trend={trendMap[p.id]} /></span></div>
                    <div className="top-player-stats">
                      <span><b>{p.total_points}</b> נק׳</span>
                      <span><b>{p.total_wins}</b> ניצ׳</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {leaderboard.length > 3 && (
              <section className="card leaderboard rest-table">
                <div className="table-head">
                  <span>מקום</span>
                  <span>שחקן</span>
                  <span className="trend-head">מגמה</span>
                  <span className="wins-head">ניצחונות</span>
                  <span className="points-head">נקודות</span>
                </div>
                {leaderboard.slice(3).map((p, i) => {
                  const rank = i + 4
                  return (
                  <Link to={`/player/${p.id}`} className={`player-row ${rank === 4 ? 'rank-four' : rank === 5 ? 'rank-five' : ''}`} key={p.id}>
                    <span className="rank">{rank}</span>
                    <span className="player">
                      <img src={p.photo_url || avatarFallback(p.name)} alt={p.name} />
                      <span className="player-text">
                        <b>{p.name}</b>
                          </span>
                    </span>
                    <span className="trend-col"><TrendArrow trend={trendMap[p.id]} /></span>
                    <span className="wins-col">{p.total_wins}</span>
                    <strong className="points-col">{p.total_points}</strong>
                  </Link>
                  )
                })}
              </section>
            )}
          </>
        )}

        {recentRounds.length > 0 && (
          <section className="recent-rounds">
            <div className="section-header-public">
              <div>
                <div className="eyebrow">ארכיון</div>
                <h2>מחזורים אחרונים</h2>
              </div>
            </div>
            <div className="round-cards">
              {recentRounds.map(r => (
                <button type="button" className="mini-round card mini-round-button" key={r.id} disabled={!r.winner_photo_url} onClick={() => r.winner_photo_url && setLightbox({ url: r.winner_photo_url, alt: `זוכי מחזור ${r.round_number}` })}>
                  {r.winner_photo_url ? <img src={r.winner_photo_url} alt="" /> : <div className="mini-placeholder">🏆</div>}
                  <div>
                    <b>מחזור {r.round_number}</b>
                    <span>{formatDate(r.round_date)}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="archive-cta"><Link to="/archive" className="secondary archive-button">לארכיון המלא ←</Link></div>
          </section>
        )}
      </main>
      <PhotoLightbox url={lightbox?.url} alt={lightbox?.alt} onClose={() => setLightbox(null)} />
    </Shell>
  )
}

function Player() {
  const { id } = useParams()
  const [player, setPlayer] = useState(null)
  const [history, setHistory] = useState([])
  const [place, setPlace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [leadersRes, resultsRes] = await Promise.all([
        supabase
          .from('leaderboard')
          .select('*')
          .order('total_points', { ascending: false })
          .order('total_wins', { ascending: false })
          .order('name'),
        supabase
          .from('results')
          .select('id, points, won, opponent_team, round:rounds(id, round_number, round_date)')
          .eq('player_id', id),
      ])

      if (leadersRes.error || resultsRes.error) {
        setError(leadersRes.error?.message || resultsRes.error?.message || 'שגיאה בטעינת השחקן')
      }

      const leaders = leadersRes.data || []
      const found = leaders.find(x => x.id === id)
      setPlayer(found || null)
      setPlace(found ? leaders.findIndex(x => x.id === id) + 1 : null)
      setHistory((resultsRes.data || []).sort((a, b) => (b.round?.round_number || 0) - (a.round?.round_number || 0)))
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <Shell><main className="page"><div className="empty">טוען…</div></main></Shell>

  return (
    <Shell>
      <main className="page narrow">
        <Link className="back" to="/">← חזרה לטבלה</Link>
        {error && <div className="notice error-box">{error}</div>}
        {!player ? (
          <div className="empty card">השחקן לא נמצא.</div>
        ) : (
          <>
            <section className="profile card">
              <img className="profile-img" src={player.photo_url || avatarFallback(player.name)} alt={player.name} />
              <h1>{player.name}</h1>
              <div className="place">מקום {place} {place === 1 ? '👑' : ''}</div>
              <div className="stats">
                <div><b>{player.total_points}</b><span>נקודות</span></div>
                <div><b>{player.total_wins}</b><span>ניצחונות</span></div>
                <div><b>{player.rounds_played}</b><span>מחזורים</span></div>
              </div>
            </section>

            <section className="card history-card">
              <h2>היסטוריית מחזורים</h2>
              <div className="history">
                {history.length === 0 ? <div className="empty">עדיין אין תוצאות לשחקן הזה.</div> : history.map(r => (
                  <div key={r.id}>
                    <span>
                      <b>מחזור {r.round?.round_number}</b>
                    </span>
                    <span className={r.won ? 'win-badge' : 'muted-badge'}>{r.won ? 'ניצחון' : '—'}</span>
                    <b>{r.points} נק׳</b>
                    <small>{formatDate(r.round?.round_date)}</small>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </Shell>
  )
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setMsg('פרטי ההתחברות אינם נכונים.')
    else onLogin()
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <div className="login-icon">🔐</div>
        <h1>כניסת מנהל</h1>
        <p>הכניסה מיועדת למנהל המערכת בלבד.</p>
        <input type="email" placeholder="אימייל" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" placeholder="סיסמה" value={password} onChange={e => setPassword(e.target.value)} required />
        <button disabled={busy}>{busy ? 'מתחבר…' : 'כניסה'}</button>
        {msg && <p className="error">{msg}</p>}
        <Link to="/">חזרה לטבלה</Link>
      </form>
    </div>
  )
}

function Admin() {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setChecking(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setIsAdmin(false)
        setChecking(false)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    setChecking(true)
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (cancelled) return
      setIsAdmin(!error && data === true)
      setChecking(false)
    })
    return () => { cancelled = true }
  }, [session])

  if (checking) return <div className="center-screen">טוען…</div>
  if (!session) return <Login onLogin={() => supabase.auth.getSession().then(({ data }) => setSession(data.session))} />
  if (!isAdmin) {
    return (
      <div className="center-screen">
        <div className="card denied">
          <h2>אין הרשאת Admin</h2>
          <p>המשתמש מחובר, אבל אינו מופיע ברשימת מנהלי המערכת.</p>
          <button onClick={async () => { await supabase.auth.signOut(); location.href = '/' }}>יציאה</button>
        </div>
      </div>
    )
  }

  return <AdminPanel />
}

function AdminPanel() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('round')
  const [players, setPlayers] = useState([])
  const [rounds, setRounds] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const nextRound = useMemo(() => (rounds.length ? Math.max(...rounds.map(r => r.round_number)) + 1 : 1), [rounds])
  const [roundNumber, setRoundNumber] = useState(1)
  const [roundDate, setRoundDate] = useState(new Date().toISOString().slice(0, 10))
  const [wins, setWins] = useState({})
  const [roundPoints, setRoundPoints] = useState(null)
  const [winnerFile, setWinnerFile] = useState(null)

  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newPhoto, setNewPhoto] = useState(null)

  const [editingPlayerId, setEditingPlayerId] = useState(null)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editPhoto, setEditPhoto] = useState(null)
  const [ratings, setRatings] = useState({})
  const [ratingPlayer, setRatingPlayer] = useState(null)
  const [historyMode, setHistoryMode] = useState('photos')

  async function loadData() {
    setLoading(true)
    const [pRes, rRes, resRes, ratingsRes] = await Promise.all([
      supabase.from('players').select('*').order('name'),
      supabase.from('rounds').select('*').order('round_number', { ascending: false }),
      supabase.from('results').select('*, player:players(id,name,photo_url), round:rounds(id,round_number,round_date)').order('created_at', { ascending: false }),
      supabase.from('player_ratings').select('*'),
    ])

    const err = pRes.error || rRes.error || resRes.error || ratingsRes.error
    if (err) setStatus(`שגיאה: ${err.message}`)
    setPlayers(pRes.data || [])
    setRounds(rRes.data || [])
    setResults(resRes.data || [])
    setRatings(Object.fromEntries((ratingsRes.data || []).map(r => [r.player_id, r])))
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])
  useEffect(() => { setRoundNumber(nextRound) }, [nextRound])

  const activePlayers = players.filter(p => p.is_active)

  async function uploadImage(bucket, file, prefix) {
    if (!file) return ''
    const safeExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${prefix}/${crypto.randomUUID()}.${safeExt}`
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false })
    if (error) throw error
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
  }

  function toggleWinner(playerId) {
    setWins(prev => ({ ...prev, [playerId]: !prev[playerId] }))
  }

  function toggleRoundPoints(value) {
    setRoundPoints(prev => prev === value ? null : value)
  }

  async function saveRound() {
    setBusy(true)
    setStatus('')
    try {
      const number = Number(roundNumber)
      if (!number || number < 1) throw new Error('מספר המחזור אינו תקין.')

      const winnerPlayers = activePlayers.filter(p => Boolean(wins[p.id]))
      if (winnerPlayers.length > 0 && !roundPoints) {
        throw new Error('בחר כמה נקודות לתת לכל המנצחים: 1, 2 או 3.')
      }

      const { data: existingRound, error: findErr } = await supabase
        .from('rounds')
        .select('*')
        .eq('round_number', number)
        .maybeSingle()
      if (findErr) throw findErr

      let winnerPhotoUrl = existingRound?.winner_photo_url || null
      if (winnerFile) winnerPhotoUrl = await uploadImage('weekly-winners', winnerFile, `round-${number}`)

      const roundPayload = {
        round_number: number,
        round_date: roundDate,
        winner_caption: null,
        winner_photo_url: winnerPhotoUrl,
      }

      let roundRow = existingRound
      if (existingRound) {
        const { data, error } = await supabase.from('rounds').update(roundPayload).eq('id', existingRound.id).select().single()
        if (error) throw error
        roundRow = data
      } else {
        const { data, error } = await supabase.from('rounds').insert(roundPayload).select().single()
        if (error) throw error
        roundRow = data
      }

      const rows = winnerPlayers.map(p => ({
        round_id: roundRow.id,
        player_id: p.id,
        points: Number(roundPoints),
        won: true,
        opponent_team: null,
      }))

      const selectedIds = new Set(rows.map(r => r.player_id))
      const activeIds = new Set(activePlayers.map(p => p.id))
      const idsToDelete = results
        .filter(r => r.round_id === roundRow.id && activeIds.has(r.player_id) && !selectedIds.has(r.player_id))
        .map(r => r.id)

      if (idsToDelete.length) {
        const { error } = await supabase.from('results').delete().in('id', idsToDelete)
        if (error) throw error
      }

      if (rows.length) {
        const { error } = await supabase.from('results').upsert(rows, { onConflict: 'round_id,player_id' })
        if (error) throw error
      }

      setStatus(`מחזור ${number} נשמר בהצלחה ✅`)
      setWins({})
      setRoundPoints(null)
      setWinnerFile(null)
      await loadData()
    } catch (err) {
      setStatus(`שגיאה: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function loadRoundForEditing(round) {
    setTab('round')
    setRoundNumber(round.round_number)
    setRoundDate(round.round_date)
    setWinnerFile(null)

    const roundResults = results.filter(r => r.round_id === round.id && r.won)
    const winMap = {}
    roundResults.forEach(r => { winMap[r.player_id] = true })
    setWins(winMap)

    const pointValues = [...new Set(roundResults.map(r => Number(r.points)).filter(Boolean))]
    setRoundPoints(pointValues.length === 1 ? pointValues[0] : null)
    if (pointValues.length > 1) {
      setStatus('למחזור הזה נשמרו בעבר ערכי ניקוד שונים. בחר ניקוד אחיד חדש לפני השמירה.')
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function addPlayer(e) {
    e.preventDefault()
    if (!newFirstName.trim()) return
    setBusy(true)
    setStatus('')
    try {
      const photoUrl = newPhoto ? await uploadImage('player-photos', newPhoto, 'players') : null
      const fullName = joinPlayerName(newFirstName, newLastName)
      const { error } = await supabase.from('players').insert({
        first_name: newFirstName.trim(),
        last_name: newLastName.trim() || null,
        name: fullName,
        team_name: null,
        photo_url: photoUrl,
        is_active: true,
      })
      if (error) throw error
      setNewFirstName('')
      setNewLastName('')
      setNewPhoto(null)
      setStatus('השחקן נוסף בהצלחה ✅')
      await loadData()
    } catch (err) {
      setStatus(`שגיאה: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  function startEditPlayer(player) {
    const parts = splitPlayerName(player)
    setEditingPlayerId(player.id)
    setEditFirstName(parts.first)
    setEditLastName(parts.last)
    setEditPhoto(null)
    setStatus('')
  }

  function cancelEditPlayer() {
    setEditingPlayerId(null)
    setEditFirstName('')
    setEditLastName('')
    setEditPhoto(null)
  }

  async function savePlayerEdit(player) {
    if (!editFirstName.trim()) {
      setStatus('שגיאה: שם פרטי לא יכול להיות ריק.')
      return
    }

    setBusy(true)
    setStatus('')
    try {
      let photoUrl = player.photo_url || null
      if (editPhoto) photoUrl = await uploadImage('player-photos', editPhoto, 'players')
      const fullName = joinPlayerName(editFirstName, editLastName)

      const { error } = await supabase
        .from('players')
        .update({
          first_name: editFirstName.trim(),
          last_name: editLastName.trim() || null,
          name: fullName,
          team_name: null,
          photo_url: photoUrl,
        })
        .eq('id', player.id)

      if (error) throw error

      setStatus('פרטי השחקן עודכנו בהצלחה ✅')
      cancelEditPlayer()
      await loadData()
    } catch (err) {
      setStatus(`שגיאה: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function togglePlayer(player) {
    setBusy(true)
    const { error } = await supabase.from('players').update({ is_active: !player.is_active }).eq('id', player.id)
    setBusy(false)
    setStatus(error ? `שגיאה: ${error.message}` : (player.is_active ? 'השחקן הוסר מהטבלה הציבורית.' : 'השחקן הוחזר לטבלה ✅'))
    if (!error) loadData()
  }

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="admin-layout">
      <aside>
        <Link to="/" className="brand"><LeagueLogo /></Link>
        <button className={tab === 'round' ? 'active' : ''} onClick={() => setTab('round')}>🏆 עדכון מחזור</button>
        <button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}>👥 ניהול שחקנים</button>
        <button className={tab === 'teams' ? 'active' : ''} onClick={() => setTab('teams')}>⚖️ חלוקת כוחות</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>🕘 היסטוריה</button>
        <button onClick={logout}>↪ יציאה</button>
      </aside>

      <main className="admin-main">
        {status && <div className={`status ${status.startsWith('שגיאה') ? 'status-error' : ''}`}>{status}</div>}

        {tab === 'round' && (
          <section>
            <div className="section-title">
              <div><span className="eyebrow">ADMIN</span><h1>עדכון תוצאות מחזור</h1></div>
              <div className="round-fields">
                <label>מחזור<input type="number" min="1" value={roundNumber} onChange={e => setRoundNumber(e.target.value)} /></label>
                <label>תאריך<input type="date" value={roundDate} onChange={e => setRoundDate(e.target.value)} /></label>
              </div>
            </div>

            <div className="card score-list winner-select-list">
              <div className="winner-list-intro">
                <div>
                  <span className="eyebrow">שלב 1</span>
                  <h2>מי ניצח במחזור?</h2>
                </div>
                <span className="winner-count">נבחרו {Object.values(wins).filter(Boolean).length} מנצחים</span>
              </div>
              {loading ? <div className="empty">טוען שחקנים…</div> : activePlayers.length === 0 ? <div className="empty">הוסף שחקנים כדי להזין תוצאות.</div> : activePlayers.map(p => (
                <button
                  type="button"
                  className={`winner-row ${wins[p.id] ? 'selected' : ''}`}
                  key={p.id}
                  onClick={() => toggleWinner(p.id)}
                >
                  <span className="player admin-player">
                    <img src={p.photo_url || avatarFallback(p.name)} alt="" />
                    <b>{p.name}</b>
                  </span>
                  <span className="winner-check" aria-hidden="true">{wins[p.id] ? '✓' : ''}</span>
                  <span className="winner-label">{wins[p.id] ? 'מנצח' : 'סמן כמנצח'}</span>
                </button>
              ))}
            </div>

            <div className="card round-points-panel">
              <div>
                <span className="eyebrow">שלב 2</span>
                <h2>כמה נקודות לתת לכל המנצחים?</h2>
                <p>הניקוד שנבחר יחול על כל השחקנים שסומנו כמנצחים במחזור הזה.</p>
              </div>
              <div className="global-score-buttons" role="group" aria-label="ניקוד לכל המנצחים">
                {[1, 2, 3].map(n => (
                  <button
                    type="button"
                    key={n}
                    aria-pressed={roundPoints === n}
                    className={roundPoints === n ? 'selected' : ''}
                    onClick={() => toggleRoundPoints(n)}
                  >
                    <b>{n}</b>
                    <span>{n === 1 ? 'נקודה' : 'נקודות'}</span>
                  </button>
                ))}
              </div>
              <small className="points-hint">לחיצה נוספת על אותו ניקוד מבטלת את הבחירה.</small>
            </div>

            <div className="card weekly-upload">
              <div>
                <span className="eyebrow">תמונת ניצחון שבועית</span>
                <h2>זוכי מחזור {roundNumber || '—'}</h2>
                <p>אפשר להעלות תמונה אחת שתופיע בעמוד הראשי ובארכיון הציבורי.</p>
              </div>
              <div className="upload-fields">
                <input type="file" accept="image/*" onChange={e => setWinnerFile(e.target.files?.[0] || null)} />
              </div>
            </div>

            <button className="primary big" disabled={busy} onClick={saveRound}>{busy ? 'שומר…' : 'שמור מחזור'}</button>
          </section>
        )}

        {tab === 'players' && (
          <section>
            <div className="section-title"><div><span className="eyebrow">ADMIN</span><h1>ניהול שחקנים</h1></div></div>

            <form className="card add-player" onSubmit={addPlayer}>
              <h2>הוסף שחקן</h2>
              <div className="form-grid">
                <input type="text" placeholder="שם פרטי" value={newFirstName} onChange={e => setNewFirstName(e.target.value)} required />
                <input type="text" placeholder="שם משפחה" value={newLastName} onChange={e => setNewLastName(e.target.value)} />
                <input type="file" accept="image/*" onChange={e => setNewPhoto(e.target.files?.[0] || null)} />
              </div>
              <button className="primary" disabled={busy}>{busy ? 'מוסיף…' : 'הוסף שחקן'}</button>
            </form>

            <div className="card manage-list">
              {players.length === 0 ? <div className="empty">עדיין אין שחקנים.</div> : players.map(p => (
                <div key={p.id} className={`${!p.is_active ? 'inactive-row ' : ''}${editingPlayerId === p.id ? 'editing-row' : ''}`.trim()}>
                  {editingPlayerId === p.id ? (
                    <div className="player-edit-panel">
                      <div className="player-edit-head">
                        <img src={p.photo_url || avatarFallback(p.name)} alt="" />
                        <div>
                          <b>עריכת שחקן</b>
                          <small>אפשר לשנות שם פרטי, שם משפחה וגם להחליף תמונה.</small>
                        </div>
                      </div>
                      <div className="player-edit-fields">
                        <input
                          type="text"
                          placeholder="שם פרטי"
                          value={editFirstName}
                          onChange={e => setEditFirstName(e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="שם משפחה"
                          value={editLastName}
                          onChange={e => setEditLastName(e.target.value)}
                        />
                        <label className="edit-photo-field">
                          <span>החלפת תמונה (אופציונלי)</span>
                          <input type="file" accept="image/*" onChange={e => setEditPhoto(e.target.files?.[0] || null)} />
                        </label>
                      </div>
                      <div className="player-edit-actions">
                        <button type="button" className="primary compact" disabled={busy} onClick={() => savePlayerEdit(p)}>
                          {busy ? 'שומר…' : 'שמור שינויים'}
                        </button>
                        <button type="button" className="secondary" disabled={busy} onClick={cancelEditPlayer}>ביטול</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="player">
                        <img src={p.photo_url || avatarFallback(p.name)} alt="" />
                        <span className="player-text"><b>{p.name}</b></span>
                      </span>
                      <span>{p.is_active ? 'פעיל' : 'מוסתר'}</span>
                      <span className="manage-actions">
                        <button type="button" className="secondary skill-button" onClick={() => setRatingPlayer(p)}>נתוני יכולת</button>
                        <button type="button" className="secondary" onClick={() => startEditPlayer(p)}>ערוך</button>
                        <button type="button" className={p.is_active ? 'danger soft' : 'restore'} onClick={() => togglePlayer(p)}>
                          {p.is_active ? 'הסתר' : 'החזר'}
                        </button>
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'teams' && (
          <TeamBuilder players={players} rounds={rounds} />
        )}

        {tab === 'history' && (
          <section>
            <div className="section-title admin-history-title">
              <div><span className="eyebrow">ADMIN</span><h1>ארכיון</h1></div>
              <div className="admin-history-tabs">
                <button type="button" className={historyMode === 'photos' ? 'active' : ''} onClick={() => setHistoryMode('photos')}>📸 היסטוריית תמונות ניצחון</button>
                <button type="button" className={historyMode === 'teams' ? 'active' : ''} onClick={() => setHistoryMode('teams')}>⚽ היסטוריית חלוקה לקבוצות</button>
              </div>
            </div>
            {historyMode === 'photos' ? (
              <div className="admin-round-grid">
                {rounds.length === 0 ? <div className="empty card">עדיין אין מחזורים.</div> : rounds.map(r => {
                  const roundResults = results.filter(x => x.round_id === r.id)
                  return (
                    <article className="card admin-round-card" key={r.id}>
                      {r.winner_photo_url && <a href={r.winner_photo_url} target="_blank" rel="noreferrer"><img src={r.winner_photo_url} alt={`זוכי מחזור ${r.round_number}`} /></a>}
                      <div className="admin-round-body">
                        <div>
                          <span className="eyebrow">מחזור {r.round_number}</span>
                          <h3>{formatDate(r.round_date)}</h3>
                          <p>{roundResults.length} שחקנים • {roundResults.reduce((sum, x) => sum + x.points, 0)} נקודות חולקו</p>
                        </div>
                        <button className="secondary" onClick={() => loadRoundForEditing(r)}>ערוך מחזור</button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <TeamHistoryPanel players={players} />
            )}
          </section>
        )}

        {ratingPlayer && (
          <RatingEditor
            player={ratingPlayer}
            initialRating={ratings[ratingPlayer.id]}
            onClose={() => setRatingPlayer(null)}
            onSaved={payload => setRatings(prev => ({ ...prev, [payload.player_id]: payload }))}
          />
        )}
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/archive" element={<PublicArchive />} />
        <Route path="/player/:id" element={<Player />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')).render(<App />)
