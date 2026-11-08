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
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(message) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(normalizedName)) {
    return message.toLocaleLowerCase().includes(normalizedName.toLocaleLowerCase())
  }
  const words = normalizedName.split(' ').map(escapeRegExp).join('\\s+')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${words}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(message)
}

function messageTextFromUserRequest(userMessage) {
  const colon = userMessage.match(/^[^:：]+[:：]\s*[“"']?(.+?)[”"']?\s*$/)
  if (colon?.[1]) return colon[1].trim().replace(/[”"']$/, '')
  const chinese = userMessage.match(/(?:发短信|发消息)(?:给)?\s*[^，。,:：]*?(?:说|内容是|告诉(?:他|她|ta))\s*[“"']?(.+?)[”"']?\s*$/i)
  if (chinese?.[1]) return chinese[1].trim().replace(/[”"']$/, '')
  const match = userMessage.match(/\b(?:that|saying|message(?:\s+them)?\s*:)\s*[“"']?(.+?)[”"']?\s*$/i)
  return match?.[1]?.trim().replace(/[”"']$/, '') || ''
}

function requestedNameFromUserRequest(userMessage) {
  const text = String(userMessage || '').trim()
  const chinese = text.match(/^(?:请)?(?:给|联系|发短信给|发消息给|打电话给|拨打)\s*(.+?)(?:发短信|发消息|打电话|拨打|说|内容是|告诉(?:他|她|ta)|[，。,:：]|$)/i)
  if (chinese?.[1]) return chinese[1].replace(/^(?:我的|我)?\s*/, '').trim()
  const cleaned = text
    .replace(/^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:please\s+)?/i, '')
    .replace(/^(?:i want to|i need to|i need you to|i'd like to|i’d like to|help me)\s+/i, '')
  const head = cleaned.split(/\b(?:that|saying|to say|with the message)\b|[:：]/i, 1)[0]
  return head
    .replace(/^send\s+(?:a\s+)?(?:text|sms|message)(?:\s+to)?\s+/i, '')
    .replace(/^(?:send|call|text|message|sms|phone|dial)\s+/i, '')
    .replace(/\s+(?:a\s+text|an\s+sms|a\s+message)$/i, '')
    .replace(/^(?:my|the)\s+/i, '')
    .trim()
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
    : /\b(?:text|message|sms)\b|发短信|发消息/i.test(userMessage) ? 'text' : /\bcall\b|打电话|拨打/i.test(userMessage) ? 'call' : ''
  const modelMessage = typeof args?.message === 'string' ? args.message.trim() : ''
  const message = action === 'text' ? messageTextFromUserRequest(userMessage) || modelMessage : ''
  return {
    contact_name: matchedName,
    action,
    message,
    ...(!matchedName ? { requested_name: requestedNameFromUserRequest(userMessage) } : {}),
    ...(matchingContacts.length > 1 ? { contact_matches: matchingContacts.map((contact) => contact.name) } : {}),
  }
}

export function isCurrentLocationRequest(text) {
  const value = String(text || '').trim()
  const directQuestion = /\b(?:where am i(?: located| at)?|where(?:'s| is) my (?:current )?(?:location|address|position)|what(?:'s| is) my (?:current )?(?:location|address|position)|what is my location right now|what location am i at|my current location|show (?:me )?my location|find my current location|my coordinates|tell me (?:my )?(?:current )?(?:location|address|position)|tell me where i am|do you know where i am|can you tell me where i am|where am i right now)\b/i.test(value)
  const personalLocationMention = /\b(?:my|me|i am|i'm|i’m)\b.{0,45}\b(?:location|address|position|coordinates|whereabouts|area|street|place)\b|\b(?:location|address|position|coordinates|whereabouts)\b.{0,45}\b(?:my|me|i am|i'm|i’m)\b/i.test(value)
  const personalWhereQuestion = /\bwhere\b.{0,45}\b(?:i am|i'm|i’m|am i|at|near me)\b/i.test(value)
  return directQuestion || personalLocationMention || personalWhereQuestion || /我(?:现在)?(?:在(?:哪里|哪)|的位置)|当前位置|现在的地址|告诉我我(?:现在)?在哪|我的(?:当前位置|位置|地址|坐标|附近在哪里)/i.test(value)
}

export function isExplicitContactActionRequest(text) {
  const value = String(text || '').trim()
  return /^(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:send|text|message|sms|call|phone|dial)\b|^(?:i want to|i need to|i need you to|i'd like to|i’d like to|help me|could you help me)\s+(?:send|text|message|sms|call|phone|dial)\b|^(?:send|please send)\b.{0,80}\b(?:a text|an sms|a message|text|sms|message)\b|^(?:请)?(?:帮我)?(?:打电话|拨打|发短信|发消息|短信联系|联系)|^(?:请)?给.+?(?:打电话|拨打|发短信|发消息|发个短信|发个消息)/i.test(value)
}
