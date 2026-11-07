import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySparkySafetyIntent } from './sparkySafety.js'

test('classifies only clear immediate-risk language for concise escalation guidance', () => {
  assert.equal(classifySparkySafetyIntent('Someone is following me'), 'immediate-risk')
  assert.equal(classifySparkySafetyIntent('I need help right now'), 'immediate-risk')
  assert.equal(classifySparkySafetyIntent('How do I report a bike theft?'), 'general')
  assert.equal(classifySparkySafetyIntent(null), 'general')
})
