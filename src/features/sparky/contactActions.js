function normalizeName(value) {
  return typeof value === 'string'
    ? value.toLocaleLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim()
    : ''
}

const CONTACT_ALIASES = Object.freeze({
  mom: ['mom', 'mother'],
  mum: ['mum', 'mother'],
  dad: ['dad', 'father'],
  papa: ['papa', 'father'],
})

function aliasesFor(normalized) {
  const direct = CONTACT_ALIASES[normalized]
  if (direct) return direct
  return Object.values(CONTACT_ALIASES).find((aliases) => aliases.includes(normalized)) || [normalized]
}

export function resolveSavedEmergencyContact(contacts, requestedName) {
  const normalized = normalizeName(requestedName)
  if (!normalized || !Array.isArray(contacts)) return { contact: null, matches: [] }
  const candidates = new Set([normalized, ...aliasesFor(normalized)])
  const matches = contacts.filter((contact) => {
    const name = normalizeName(contact?.name)
    return name && (candidates.has(name) || [...candidates].some((candidate) => name.includes(candidate) || candidate.includes(name)))
  })
  return { contact: matches.length === 1 ? matches[0] : null, matches }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function nameAppearsInMessage(message, name) {
  const normalizedName = normalizeName(name)
  if (!normalizedName) return false
  const words = normalizedName.split(' ').map(escapeRegExp).join('\\s+')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${words}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(message)
}

function messageTextFromUserRequest(userMessage) {
  const match = userMessage.match(/\b(?:that|saying|message(?:\s+them)?\s*:)\s*[“"']?(.+?)[”"']?\s*$/i)
  return match?.[1]?.trim().replace(/[”"']$/, '') || ''
}

/**
 * Fill missing model arguments only from the user's latest request and local
 * contacts. The model must still choose this allowlisted action; the caller
 * must still present a confirmation before handing off to phone/SMS.
 */
export function resolveContactActionFromRequest(args, userMessage, contacts) {
  const available = Array.isArray(contacts) ? contacts : []
  const matchingContacts = available.filter((contact) => nameAppearsInMessage(userMessage, contact?.name))
  const requestedName = typeof args?.contact_name === 'string' ? args.contact_name.trim() : ''
  const matchedName = matchingContacts.length === 1 ? matchingContacts[0].name : requestedName
  const requestedAction = args?.action
  const action = ['call', 'text'].includes(requestedAction)
    ? requestedAction
    : /\b(?:text|message)\b/i.test(userMessage) ? 'text' : /\bcall\b/i.test(userMessage) ? 'call' : ''
  const modelMessage = typeof args?.message === 'string' ? args.message.trim() : ''
  const message = action === 'text' ? messageTextFromUserRequest(userMessage) || modelMessage : ''
  return { contact_name: matchedName, action, message }
}
