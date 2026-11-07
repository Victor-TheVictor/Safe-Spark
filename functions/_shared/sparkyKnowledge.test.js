import test from 'node:test'
import assert from 'node:assert/strict'
import { retrieveSparkyKnowledge, SPARKY_KNOWLEDGE } from './sparkyKnowledge.js'

test('retrieval returns only relevant, dated official IU sources', () => {
  const results = retrieveSparkyKnowledge('Where is the nearest blue light phone?')
  assert.equal(results[0].id, 'blue-light-phones')
  assert.match(results[0].source, /^https:\/\/protect\.iu\.edu\//)
  assert.ok(results[0].updatedAt)
  assert.deepEqual(retrieveSparkyKnowledge('the weather in Paris'), [])
  assert.ok(SPARKY_KNOWLEDGE.every((item) => item.source.startsWith('https://protect.iu.edu/')))
})
