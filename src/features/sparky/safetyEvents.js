const EVENT_PREFIX = 'safespark-sparky-events-v1:'

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `event-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function safetyEventKey(profileId) {
  return `${EVENT_PREFIX}${profileId || 'local-profile'}`
}

export function readSafetyEvents(profileId) {
  try {
    const events = JSON.parse(localStorage.getItem(safetyEventKey(profileId)) || '[]')
    return Array.isArray(events) ? events.filter((event) => event && typeof event.id === 'string').slice(-50) : []
  } catch { return [] }
}

export function recordSafetyEvent(profileId, details) {
  if (!details || typeof details !== 'object' || typeof details.timestamp !== 'string') return null
  const event = {
    id: makeId(),
    type: details.type === 'safety_phrase' ? 'safety_phrase' : 'manual_sos',
    timestamp: details.timestamp,
    status: details.status === 'dialer_opened_unconfirmed' || details.status === 'sms_composer_opened_unconfirmed'
      ? details.status
      : 'not_sent',
  }
  try {
    localStorage.setItem(safetyEventKey(profileId), JSON.stringify([...readSafetyEvents(profileId), event].slice(-50)))
    return event
  } catch { return null }
}

export function updateSafetyEventStatus(profileId, eventId, status) {
  const allowed = ['dialer_opened_unconfirmed', 'sms_composer_opened_unconfirmed']
  if (!eventId || !allowed.includes(status)) return false
  try {
    const next = readSafetyEvents(profileId).map((event) => event.id === eventId ? { ...event, status } : event)
    localStorage.setItem(safetyEventKey(profileId), JSON.stringify(next))
    return next.some((event) => event.id === eventId)
  } catch { return false }
}
