import test from 'node:test'
import assert from 'node:assert/strict'
import { transcriptMatchesSafetyPhrase } from './safetyPhrase.js'

test('safety phrase matching requires a full normalized phrase boundary', () => {
  assert.equal(transcriptMatchesSafetyPhrase('I am saying Red Lantern now', 'Red Lantern'), true)
  assert.equal(transcriptMatchesSafetyPhrase('red, lantern!', 'Red Lantern'), true)
  assert.equal(transcriptMatchesSafetyPhrase('I saw a red lantern outside', 'Red Lantern'), true)
  assert.equal(transcriptMatchesSafetyPhrase('red lanternfish', 'Red Lantern'), false)
  assert.equal(transcriptMatchesSafetyPhrase('red lantern', ''), false)
})
