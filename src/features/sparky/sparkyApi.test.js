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
