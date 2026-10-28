// Shared, versioned browser drafts for admin workflows.
// Existing keys are retained so previously saved drafts remain recoverable.
export function readDraft(key, fallback = null) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}
export function saveDraft(key, value) {
  try {
    const payload = { ...value, updatedAt: Date.now(), draftVersion: 2 }
    localStorage.setItem(key, JSON.stringify(payload))
    return true
  } catch { return false }
}
export function clearDraft(key) {
  try { localStorage.removeItem(key); return true } catch { return false }
}
export function hasMeaningfulTeamDraft(d) {
  return Boolean(d?.editingSessionId || d?.selectedIds?.length || (d?.draftTeams && Object.keys(d.draftTeams).length))
}
export function formatDraftTime(ts) {
  return ts ? new Intl.DateTimeFormat('he-IL',{hour:'2-digit',minute:'2-digit'}).format(new Date(ts)) : ''
}
