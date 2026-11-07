async function readError(response) {
  try {
    const payload = await response.json()
    return typeof payload.error === 'string' ? payload.error : `Request failed (${response.status}).`
  } catch {
    return `Request failed (${response.status}).`
  }
}

export async function streamSparkyReply(messages, { signal, onDelta } = {}) {
  const response = await fetch('/api/sparky/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))
  if (response.headers.get('Content-Type')?.includes('application/json')) {
    const payload = await response.json()
    if (payload.type === 'app_action' && payload.action && typeof payload.action.screen === 'string') return payload
    if (payload.type === 'contact_action' && payload.action && typeof payload.action.contactName === 'string') return payload
    throw new Error('Sparky returned an invalid app action.')
  }
  if (!response.body) throw new Error('Streaming is not available in this browser.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let reply = ''

  function consumeBlock(block) {
    const data = block.split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n')
    if (!data || data === '[DONE]') return
    let event
    try { event = JSON.parse(data) } catch { return }
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      reply += event.delta
      onDelta?.(event.delta, reply)
    } else if (event.type === 'error' || event.type === 'response.failed') {
      throw new Error('Sparky could not finish that response. Please try again.')
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      buffer = buffer.replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary).replace(/\r/g, '')
        buffer = buffer.slice(boundary + 2)
        consumeBlock(block)
        boundary = buffer.indexOf('\n\n')
      }
      if (done) break
    }
    if (buffer.trim()) consumeBlock(buffer.replace(/\r/g, ''))
  } finally {
    reader.releaseLock()
  }
  return reply
}

export async function getSuggestedReplies(messages, { signal } = {}) {
  const response = await fetch('/api/sparky/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))
  const payload = await response.json()
  return Array.isArray(payload.suggestions) ? payload.suggestions : []
}

export async function getDraftCompletion(draft, messages, { signal } = {}) {
  const response = await fetch('/api/sparky/completion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft, messages }),
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))
  const payload = await response.json()
  return typeof payload.completion === 'string' ? payload.completion : ''
}

export async function createRealtimeClientSecret(messages, { signal, safetyId } = {}) {
  const response = await fetch('/api/sparky/realtime/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: messages.slice(-12), safety_id: safetyId }),
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))
  const payload = await response.json()
  if (typeof payload.client_secret !== 'string' || !payload.client_secret) {
    throw new Error('The voice session did not return a temporary credential.')
  }
  return payload
}
