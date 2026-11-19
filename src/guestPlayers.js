// Guest players are temporary lineup placeholders, not league members.
// is_guest + guest_level are the canonical database fields. The name fallback
// supports previously created placeholders before the database migration.
const guestNamePattern = /^שחקן\s+מזדמן(?:\s*[-–:]?\s*(?:רמה|דירוג)?\s*\(?\s*([357])\s*\)?)?$/u

export function guestLevel(player) {
  if (!player) return null
  const name = String(player.name || '').trim().replace(/\s+/g, ' ')
  const nameMatch = name.match(guestNamePattern)
  const level = Number(player.guest_level ?? nameMatch?.[1])
  if (player.is_guest === true || nameMatch) return [3, 5, 7].includes(level) ? level : 5
  return null
}

export const isGuestPlayer = player => guestLevel(player) !== null
export const isLeaguePlayer = player => Boolean(player?.is_active) && !isGuestPlayer(player)
export const guestDisplayName = player => isGuestPlayer(player) ? 'שחקן מזדמן' : String(player?.name || '')
export const guestBadge = player => isGuestPlayer(player) ? `מזדמן • רמה ${guestLevel(player)}` : ''
export const guestSkillProfile = player => {
  const value = guestLevel(player)
  if (value === null) return null
  return {
    technical: value, passing: value, speed: value, attack: value,
    defense: value, physical: value, game_iq: value, goalkeeper: value,
    preferred_position: 'general',
  }
}
