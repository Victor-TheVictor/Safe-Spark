import test from 'node:test'
import assert from 'node:assert/strict'
import { streamSparkyReply } from './sparkyApi.js'

test('streamSparkyReply emits deltas from CRLF-delimited server events', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response([
    'event: response.output_text.delta\r\n',
    'data: {"type":"response.output_text.delta","delta":"A lit "}\r\n\r\n',
    'event: response.output_text.delta\r\n',
    'data: {"type":"response.output_text.delta","delta":"route."}\r\n\r\n',
    'data: [DONE]\r\n\r\n',
  ].join(''), { headers: { 'Content-Type': 'text/event-stream' } })
  try {
    const deltas = []
    const reply = await streamSparkyReply([{ role: 'user', content: 'Help plan my route.' }], {
      onDelta: (_delta, accumulated) => deltas.push(accumulated),
    })
    assert.equal(reply, 'A lit route.')
    assert.deepEqual(deltas, ['A lit ', 'A lit route.'])
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('streamSparkyReply returns a validated model-selected app action', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ type: 'app_action', action: { screen: 'safety_map', path: '/map', label: 'Safety Map' } })
  try {
    const result = await streamSparkyReply([{ role: 'user', content: 'Open the map' }])
    assert.deepEqual(result, { type: 'app_action', action: { screen: 'safety_map', path: '/map', label: 'Safety Map' } })
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('streamSparkyReply returns a contact action for an explicit user confirmation step', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ type: 'contact_action', action: { contactName: 'Mom', action: 'text', message: 'I am safe.' } })
  try {
    const result = await streamSparkyReply([{ role: 'user', content: 'Text my mom that I am safe.' }])
    assert.deepEqual(result, { type: 'contact_action', action: { contactName: 'Mom', action: 'text', message: 'I am safe.' } })
  } finally {
    globalThis.fetch = previousFetch
  }
})
