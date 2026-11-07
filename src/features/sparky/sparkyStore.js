const STORAGE_PREFIX = 'safespark-sparky-v1:'

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function sparkyStorageKey(profileId) {
  return `${STORAGE_PREFIX}${profileId}`
}

function createConversation() {
  const now = new Date().toISOString()
  return { id: makeId(), title: 'New conversation', createdAt: now, updatedAt: now, messages: [] }
}

export function createInitialSparkyStore() {
  const conversation = createConversation()
  return {
    version: 1,
    activeConversationId: conversation.id,
    conversations: [conversation],
    preferences: { safetyPhrase: 'Red Lantern', safetyPhraseEnabled: false },
  }
}

function normalizeMessage(message, conversationId) {
  if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') return null
  if (!message.content.trim()) return null
  return {
    id: typeof message.id === 'string' ? message.id : makeId(),
    conversationId,
    role: message.role,
    content: message.content.slice(0, 8_000),
    mode: message.mode === 'voice' ? 'voice' : 'text',
    timestamp: typeof message.timestamp === 'string' ? message.timestamp : new Date().toISOString(),
  }
}

export function readSparkyStore(profileId) {
  const fallback = createInitialSparkyStore()
  if (!profileId || typeof localStorage === 'undefined') return fallback
  try {
    const raw = JSON.parse(localStorage.getItem(sparkyStorageKey(profileId)) || 'null')
    if (!raw || !Array.isArray(raw.conversations)) return fallback
    const conversations = raw.conversations
      .filter((item) => item && typeof item.id === 'string')
      .map((item) => ({
        id: item.id,
        title: typeof item.title === 'string' ? item.title : 'Conversation',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
        messages: Array.isArray(item.messages)
          ? item.messages.map((message) => normalizeMessage(message, item.id)).filter(Boolean).slice(-300)
          : [],
      }))
    const activeConversationId = conversations.some((item) => item.id === raw.activeConversationId)
      ? raw.activeConversationId
      : conversations[0]?.id
    const preferences = raw.preferences || {}
    return {
      version: 1,
      activeConversationId: activeConversationId || fallback.activeConversationId,
      conversations: conversations.length ? conversations : fallback.conversations,
      preferences: {
        safetyPhrase: typeof preferences.safetyPhrase === 'string' && preferences.safetyPhrase.trim()
          ? preferences.safetyPhrase.trim().slice(0, 40)
          : 'Red Lantern',
        safetyPhraseEnabled: preferences.safetyPhraseEnabled === true,
      },
    }
  } catch {
    return fallback
  }
}

export function writeSparkyStore(profileId, store) {
  if (!profileId || typeof localStorage === 'undefined') return false
  try {
    const conversations = store.conversations.slice(-25).map((conversation) => ({
      ...conversation,
      messages: conversation.messages.slice(-300),
    }))
    localStorage.setItem(sparkyStorageKey(profileId), JSON.stringify({ ...store, conversations }))
    return true
  } catch {
    return false
  }
}

export function makeSparkyMessage(conversationId, role, content, mode = 'text') {
  return normalizeMessage({ role, content, mode }, conversationId)
}

export function appendSparkyMessage(store, conversationId, message) {
  return {
    ...store,
    conversations: store.conversations.map((conversation) => {
      if (conversation.id !== conversationId) return conversation
      const normalized = normalizeMessage(message, conversationId)
      if (!normalized || conversation.messages.some((existing) => existing.id === normalized.id)) return conversation
      const messages = [...conversation.messages, normalized].slice(-300)
      const firstUser = messages.find((item) => item.role === 'user')
      return {
        ...conversation,
        title: conversation.title === 'New conversation' && firstUser
          ? firstUser.content.slice(0, 42)
          : conversation.title,
        updatedAt: normalized.timestamp,
        messages,
      }
    }),
  }
}

export function ensureActiveConversation(store) {
  if (store.conversations.some((item) => item.id === store.activeConversationId)) return store
  const conversation = createConversation()
  return { ...store, activeConversationId: conversation.id, conversations: [conversation, ...store.conversations] }
}

export function createNewSparkyConversation(store) {
  const conversation = createConversation()
  return { ...store, activeConversationId: conversation.id, conversations: [conversation, ...store.conversations].slice(0, 25) }
}

export function storeSparkyPreferences(store, preferences) {
  return { ...store, preferences: { ...store.preferences, ...preferences } }
}
