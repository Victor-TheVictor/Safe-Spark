import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveContactActionFromRequest, resolveSavedEmergencyContact } from './contactActions.js'

const contacts = [
  { id: '1', name: 'Preview Tester', phone: '+1 812 555 0123' },
  { id: '2', name: 'Jordan Lee', phone: '+1 812 555 0177' },
]

test('matches only a single saved contact actually named in the user request', () => {
  const result = resolveContactActionFromRequest({}, 'Please text Preview Tester that I am safe.', contacts)
  assert.deepEqual(result, { contact_name: 'Preview Tester', action: 'text', message: 'I am safe.' })
})

test('does not choose between multiple saved contacts named in the request', () => {
  const result = resolveContactActionFromRequest({}, 'Text Preview Tester and Jordan Lee that I am safe.', contacts)
  assert.equal(result.contact_name, '')
})

test('uses an explicit model message only when the user did not provide quoted content', () => {
  const result = resolveContactActionFromRequest({ contact_name: 'Jordan Lee', action: 'text', message: 'I am okay.' }, 'Text Jordan Lee.', contacts)
  assert.deepEqual(result, { contact_name: 'Jordan Lee', action: 'text', message: 'I am okay.' })
})

test('resolves familiar names and rejects ambiguous matches', () => {
  assert.equal(resolveSavedEmergencyContact([{ name: 'Mom', phone: '8125550100' }], 'mother').contact.name, 'Mom')
  const result = resolveSavedEmergencyContact([{ name: 'Mom' }, { name: 'My Mom' }], 'mom')
  assert.equal(result.contact, null)
  assert.equal(result.matches.length, 2)
})
