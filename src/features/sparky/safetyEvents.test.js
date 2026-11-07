import test from 'node:test'
import assert from 'node:assert/strict'
import { readSafetyEvents, recordSafetyEvent, safetyEventKey, updateSafetyEventStatus } from './safetyEvents.js'

test('safety event records contain only a timestamp, event type, and unconfirmed action status', () => {
  const previousStorage = globalThis.localStorage
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
  try {
    const recorded = recordSafetyEvent('profile-1', { type: 'safety_phrase', timestamp: '2026-11-07T12:00:00.000Z', latitude: 39.1 })
    assert.equal(recorded.status, 'not_sent')
    assert.equal('latitude' in recorded, false)
    assert.equal(readSafetyEvents('profile-1').length, 1)
    assert.equal(updateSafetyEventStatus('profile-1', recorded.id, 'sms_composer_opened_unconfirmed'), true)
    assert.equal(readSafetyEvents('profile-1')[0].status, 'sms_composer_opened_unconfirmed')
    assert.equal(values.has(safetyEventKey('other-profile')), false)
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
  }
})
