export const CONTACTS_KEY = 'safespark-emergency-contacts'
export const PRIMARY_CONTACT_KEY = 'safespark-primary-contact'
export const SAFE_WALK_KEY = 'safespark-walk-session'

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `contact-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function loadContacts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONTACTS_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    const normalized = parsed
      .filter((contact) => contact && typeof contact.name === 'string' && typeof contact.phone === 'string')
      .map((contact) => ({ ...contact, id: contact.id || createId() }))
    if (normalized.length !== parsed.length || normalized.some((contact, index) => contact.id !== parsed[index]?.id)) {
      localStorage.setItem(CONTACTS_KEY, JSON.stringify(normalized))
    }
    return normalized
  } catch {
    return []
  }
}

export function saveContacts(contacts) {
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts))
}

export function loadPrimaryContactId(contacts = loadContacts()) {
  try {
    const savedId = localStorage.getItem(PRIMARY_CONTACT_KEY)
    return contacts.some((contact) => contact.id === savedId) ? savedId : (contacts[0]?.id ?? '')
  } catch {
    return contacts[0]?.id ?? ''
  }
}

export function savePrimaryContactId(id) {
  try {
    if (id) localStorage.setItem(PRIMARY_CONTACT_KEY, id)
    else localStorage.removeItem(PRIMARY_CONTACT_KEY)
  } catch {
    // Contacts remain usable for this session when storage is unavailable.
  }
}

export function phoneForAction(phone = '') {
  return phone.replace(/[^+\d]/g, '')
}
