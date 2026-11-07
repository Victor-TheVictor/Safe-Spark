import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  handleChat,
  handleCompletion,
  handleHealth,
  handleRealtimeSession,
  handleSuggestions,
} from './sparky.js'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

function request(path, body, { origin = 'https://safe-spark.example', method = 'POST' } = {}) {
  return new Request(`https://safe-spark.example${path}`, {
    method,
    headers: {
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

const context = (endpoint, body, env = { OPENAI_API_KEY: 'test-secret' }, options) => ({
  request: request(`/api/sparky/${endpoint}`, body, options),
  env,
})

const conversation = [
  { role: 'user', content: 'How can I stay safer walking home?' },
]

test('health reports configuration without exposing the API key', async () => {
  const response = await handleHealth({ env: { OPENAI_API_KEY: 'private-test-value' } })
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.configured, true)
  assert.equal(JSON.stringify(payload).includes('private-test-value'), false)
})

test('chat rejects missing credentials and malformed requests', async () => {
  const missingKey = await handleChat(context('chat', { messages: conversation }, {}))
  assert.equal(missingKey.status, 503)
  const invalid = await handleChat(context('chat', { messages: [{ role: 'system', content: 'x' }] }))
  assert.equal(invalid.status, 400)
})

test('chat rejects a cross-origin request', async () => {
  const response = await handleChat(context('chat', { messages: conversation }, { OPENAI_API_KEY: 'test-secret' }, { origin: 'https://attacker.example' }))
  assert.equal(response.status, 403)
})

test('chat rejects a request with no browser origin', async () => {
  const response = await handleChat(context('chat', { messages: conversation }, { OPENAI_API_KEY: 'test-secret' }, { origin: null }))
  assert.equal(response.status, 403)
})

test('chat forwards streaming output from the Responses API', async () => {
  const streamBody = 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Stay near a lit route."}\n\n'
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, 'POST')
    assert.equal(JSON.parse(options.body).stream, true)
    assert.equal(JSON.parse(options.body).store, false)
    return new Response(streamBody, { headers: { 'Content-Type': 'text/event-stream' } })
  }
  const response = await handleChat(context('chat', { messages: conversation }))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('Content-Type'), /text\/event-stream/)
  assert.equal(await response.text(), streamBody)
})

test('chat lets the model select an allowlisted SafeSpark navigation tool', async () => {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body)
    assert.equal(body.stream, undefined)
    assert.ok(body.tools.some((tool) => tool.name === 'navigate_to_safe_spark_screen'))
    return Response.json({ output: [{ type: 'function_call', name: 'navigate_to_safe_spark_screen', arguments: '{"screen":"safety_map"}' }] })
  }
  const response = await handleChat(context('chat', { messages: [{ role: 'user', content: 'Please open the safety map.' }] }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { type: 'app_action', action: { screen: 'safety_map', path: '/map', label: 'Safety Map' } })
})

test('chat rejects a model tool call outside the SafeSpark route allowlist', async () => {
  globalThis.fetch = async () => Response.json({ output: [{ type: 'function_call', name: 'navigate_to_safe_spark_screen', arguments: '{"screen":"admin"}' }] })
  const response = await handleChat(context('chat', { messages: [{ role: 'user', content: 'Open profile.' }] }))
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /not available/)
})

test('chat prepares a contact action for in-app confirmation without exposing contact data to the server', async () => {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body)
    assert.ok(body.tools.some((tool) => tool.name === 'request_emergency_contact_action'))
    return Response.json({ output: [{ type: 'function_call', name: 'request_emergency_contact_action', arguments: '{"contact_name":"Mom","action":"text","message":"I am safe."}' }] })
  }
  const response = await handleChat(context('chat', { messages: [{ role: 'user', content: 'Text my mom that I am safe.' }] }))
  assert.deepEqual(await response.json(), { type: 'contact_action', action: { contactName: 'Mom', action: 'text', message: 'I am safe.' } })
})

test('suggestions use the latest context and return short reply options', async () => {
  globalThis.fetch = async () => Response.json({ output_text: '{"suggestions":["Can you help plan my route?","Where are the phones?","Can I text my friend?"]}' })
  const response = await handleSuggestions(context('suggestions', {
    messages: [...conversation, { role: 'assistant', content: 'Use a lit route and share your ETA.' }],
  }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).suggestions.length, 3)
})

test('completion returns a draft continuation without replacing the draft', async () => {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body)
    assert.equal(body.store, false)
    assert.match(body.input.at(-1).content, /Current unsent draft/)
    return Response.json({ output_text: ' and share my ETA with a friend.' })
  }
  const response = await handleCompletion(context('completion', { draft: 'I am walking back and want to', messages: [] }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).completion, 'and share my ETA with a friend.')
})

test('Realtime endpoint returns only a short-lived credential and a hashed safety identifier', async () => {
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /realtime\/client_secrets$/)
    const body = JSON.parse(options.body)
    assert.equal(body.expires_after.seconds, 90)
    assert.equal(body.session.model, 'gpt-realtime-2.1')
    assert.ok(body.session.tools.some((tool) => tool.name === 'navigate_to_safe_spark_screen'))
    assert.equal(body.session.audio.input.turn_detection.type, 'server_vad')
    assert.equal(body.session.tools[0].strict, undefined)
    assert.doesNotMatch(body.session.instructions, /Recent conversation for continuity/)
    assert.match(options.headers['OpenAI-Safety-Identifier'], /^[a-f0-9]{64}$/)
    return Response.json({ value: 'temporary-client-secret', expires_at: 1234 })
  }
  const response = await handleRealtimeSession(context('realtime/session', { messages: conversation, safety_id: 'local-profile-id' }))
  const text = await response.text()
  assert.equal(response.status, 200)
  assert.match(text, /temporary-client-secret/)
  assert.equal(text.includes('test-secret'), false)
})

test('provider failures return a generic error without echoing credentials', async () => {
  globalThis.fetch = async () => new Response('provider failure', { status: 500 })
  const response = await handleSuggestions(context('suggestions', {
    messages: [...conversation, { role: 'assistant', content: 'Try a well-lit route.' }],
  }))
  assert.equal(response.status, 502)
  assert.equal((await response.text()).includes('test-secret'), false)
})
