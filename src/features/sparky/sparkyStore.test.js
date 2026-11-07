import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendSparkyMessage,
  ensureActiveConversation,
  makeSparkyMessage,
  readSparkyStore,
  sparkyStorageKey,
  storeSparkyPreferences,
  writeSparkyStore,
} from './sparkyStore.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, String(value)) },
    removeItem(key) { values.delete(key) },
  }
}

test('conversation history persists and stays isolated by local profile', () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: memoryStorage() })
  try {
    const profileId = 'profile-a'
    let store = ensureActiveConversation(readSparkyStore(profileId))
    const conversationId = store.activeConversationId
    store = appendSparkyMessage(store, conversationId, makeSparkyMessage(conversationId, 'user', 'How do I get home?', 'text'))
    store = appendSparkyMessage(store, conversationId, makeSparkyMessage(conversationId, 'assistant', 'Share your route with someone you trust.', 'text'))
    store = appendSparkyMessage(store, conversationId, makeSparkyMessage(conversationId, 'user', 'Can you repeat that?', 'voice'))
    store = appendSparkyMessage(store, conversationId, makeSparkyMessage(conversationId, 'assistant', 'Of course. Share your route and ETA.', 'voice'))
    store = storeSparkyPreferences(store, { safetyPhrase: 'Blue Lantern', safetyPhraseEnabled: true })

    assert.equal(writeSparkyStore(profileId, store), true)
    const reloaded = readSparkyStore(profileId)
    const messages = reloaded.conversations.find((item) => item.id === conversationId).messages
    assert.deepEqual(messages.map((message) => message.mode), ['text', 'text', 'voice', 'voice'])
    assert.equal(reloaded.preferences.safetyPhrase, 'Blue Lantern')
    assert.equal(reloaded.preferences.safetyPhraseEnabled, true)
    assert.equal(sparkyStorageKey('profile-a') === sparkyStorageKey('profile-b'), false)
    assert.equal(readSparkyStore('profile-b').conversations[0].messages.length, 0)
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
    else delete globalThis.localStorage
  }
})
