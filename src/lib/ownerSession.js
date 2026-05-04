const STORAGE_KEY = 'alegrame-owner-session-id'

/** Identifica al navegador para agrupar conversaciones (sin login). */
export function getOrCreateOwnerSessionId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(STORAGE_KEY, id)
    }
    return id
  } catch {
    return `owner-${Date.now()}`
  }
}
