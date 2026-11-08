import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isCurrentLocationRequest,
  isExplicitContactActionRequest,
  resolveContactActionFromRequest,
  resolveSavedEmergencyContact,
} from './contactActions.js'

const contacts = [
  { id: '1', name: 'Preview Tester', phone: '+1 812 555 0123' },
  { id: '2', name: 'Jordan Lee', phone: '+1 812 555 0177' },
]

test('matches only a single saved contact actually named in the user request', () => {
  const result = resolveContactActionFromRequest({}, 'Please text Preview Tester that I am safe.', contacts)
  assert.deepEqual(result, { contact_name: 'Preview Tester', action: 'text', message: 'I am safe.' })
})

test('parses direct send requests even if AI service is unavailable', () => {
  assert.equal(isExplicitContactActionRequest('Text Preview Tester: I am safe.'), true)
  assert.deepEqual(resolveContactActionFromRequest({}, 'Text Preview Tester: I am safe.', contacts), {
    contact_name: 'Preview Tester',
    action: 'text',
    message: 'I am safe.',
  })
  assert.equal(isExplicitContactActionRequest('请给Mom发短信说我安全。'), true)
  assert.deepEqual(resolveContactActionFromRequest({}, '请给Mom发短信说我安全。', [{ ...contacts[0], name: 'Mom' }]), {
    contact_name: 'Mom',
    action: 'text',
    message: '我安全。',
  })
  assert.equal(isExplicitContactActionRequest('Could you send Victor a text saying I am safe?'), true)
  assert.equal(isExplicitContactActionRequest('I want to message Victor that I am safe.'), true)
  const victor = [{ ...contacts[0], name: 'Victor' }]
  assert.deepEqual(resolveContactActionFromRequest({}, 'Could you send Victor a text saying I am safe?', victor), {
    contact_name: 'Victor', action: 'text', message: 'I am safe?',
  })
  assert.deepEqual(resolveContactActionFromRequest({}, 'I want to message Victor that I am safe.', victor), {
    contact_name: 'Victor', action: 'text', message: 'I am safe.',
  })
})

test('recognizes location questions in English and Chinese for local handling', () => {
  assert.equal(isCurrentLocationRequest('Where am I right now?'), true)
  assert.equal(isCurrentLocationRequest('Can you tell me where I am?'), true)
  assert.equal(isCurrentLocationRequest('What is my current address?'), true)
  assert.equal(isCurrentLocationRequest('Tell me my location'), true)
  assert.equal(isCurrentLocationRequest('What is my exact location?'), true)
  assert.equal(isCurrentLocationRequest('Can you check my current address?'), true)
  assert.equal(isCurrentLocationRequest('我现在在哪？'), true)
  assert.equal(isCurrentLocationRequest('How does GPS work?'), false)
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
