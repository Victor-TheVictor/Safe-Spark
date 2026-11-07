import { SPARKY_SYSTEM_PROMPT } from './sparkyPrompt.js'
import { retrieveSparkyKnowledge } from './sparkyKnowledge.js'
import { classifySparkySafetyIntent } from './sparkySafety.js'
import { getSparkyAppAction, SPARKY_APP_TOOLS, SPARKY_REALTIME_TOOLS } from '../../shared/sparkyActions.js'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const OPENAI_REALTIME_SECRET_URL = 'https://api.openai.com/v1/realtime/client_secrets'
const MAX_BODY_CHARS = 32_000
const MAX_MESSAGE_CHARS = 4_000
const MAX_MESSAGES = 20
const rateBuckets = new Map()

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  })
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin')
  return origin === new URL(request.url).origin
}

function rateLimit(request, lane, maximum, windowMs = 60_000) {
  const ip = request.headers.get('cf-connecting-ip') || 'local'
  const key = `${ip}:${lane}`
  const now = Date.now()
  const previous = rateBuckets.get(key)
  if (!previous || now - previous.startedAt >= windowMs) {
    if (rateBuckets.size > 2_000) {
      for (const [bucketKey, bucket] of rateBuckets) {
        if (now - bucket.startedAt >= windowMs) rateBuckets.delete(bucketKey)
      }
    }
    rateBuckets.set(key, { startedAt: now, count: 1 })
    return true
  }
  if (previous.count >= maximum) return false
  previous.count += 1
  return true
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get('Content-Length') || 0)
  if (declaredLength > MAX_BODY_CHARS) return { error: 'Request is too large.' }
  let text
  try {
    text = await request.text()
  } catch {
    return { error: 'Request body could not be read.' }
  }
  if (text.length > MAX_BODY_CHARS) return { error: 'Request is too large.' }
  try {
    return { value: JSON.parse(text) }
  } catch {
    return { error: 'Request body must be valid JSON.' }
  }
}

function normalizeMessages(value, { minimum = 1 } = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > MAX_MESSAGES) return null
  const messages = value.map((message) => {
    if (!message || !['user', 'assistant'].includes(message.role)) return null
    if (typeof message.content !== 'string' || !message.content.trim() || message.content.length > MAX_MESSAGE_CHARS) return null
    return { role: message.role, content: message.content.trim() }
  })
  return messages.every(Boolean) ? messages : null
}

function checkRequest(request, lane, maximum) {
  if (!sameOrigin(request)) return json({ error: 'Cross-origin requests are not allowed.' }, 403)
  if (!rateLimit(request, lane, maximum)) {
    return json({ error: 'Too many requests. Please wait a moment and try again.' }, 429, { 'Retry-After': '60' })
  }
  return null
}

function missingKey() {
  return json({ error: 'Sparky is not connected yet. Add OPENAI_API_KEY to the Cloudflare Pages project to enable AI.' }, 503)
}

function openAiHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
}

function knowledgeInstructions(query) {
  const sources = retrieveSparkyKnowledge(query)
  const references = sources.map((source) => `- ${source.content} Source: ${source.source} (verified ${source.updatedAt}).`).join('\n')
  const knowledge = references ? `\n\nTrusted IU Bloomington reference material. Use only when relevant, name the source when helpful, and do not extend these facts beyond the reference:\n${references}` : ''
  const urgent = classifySparkySafetyIntent(query) === 'immediate-risk'
    ? '\n\nThe latest message indicates possible immediate danger. Be brief and direct: tell the user to call 911 now if in the United States (or their local emergency number), move toward a staffed public place if safe, and contact a trusted person. Never delay that with follow-up questions or claim an alert was sent.'
    : ''
  return `${SPARKY_SYSTEM_PROMPT}${knowledge}${urgent}`
}

async function openAiSafetyIdentifier(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 120) return undefined
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function parseOpenAiJson(response) {
  let payload
  try {
    payload = await response.json()
  } catch {
    return null
  }
  return response.ok ? payload : null
}

function providerFailure(status) {
  if (status === 401 || status === 403) return json({ error: 'The server API key was rejected or this project cannot access the selected model. Check the Cloudflare secret and OpenAI project permissions.' }, 502)
  if (status === 429) return json({ error: 'The OpenAI project is rate limited or out of available API quota. Check its usage and billing, then retry.' }, 502)
  if (status === 400) return json({ error: 'OpenAI rejected the Realtime session configuration. Check the configured model and voice settings.' }, 502)
  return json({ error: 'Sparky could not connect right now. Please try again shortly.' }, 502)
}

export async function handleHealth({ env }) {
  return json({
    ok: true,
    service: 'sparky',
    provider: 'OpenAI',
    configured: Boolean(env.OPENAI_API_KEY),
    persistence: 'browser-local',
    features: {
      text: Boolean(env.OPENAI_API_KEY),
      suggestions: Boolean(env.OPENAI_API_KEY),
      completion: Boolean(env.OPENAI_API_KEY),
      realtimeVoice: Boolean(env.OPENAI_API_KEY),
    },
  })
}

export async function handleChat(context) {
  const { request, env } = context
  const rejected = checkRequest(request, 'chat', 24)
  if (rejected) return rejected
  if (!env.OPENAI_API_KEY) return missingKey()

  const parsed = await readJson(request)
  if (parsed.error) return json({ error: parsed.error }, 400)
  const messages = normalizeMessages(parsed.value?.messages)
  if (!messages || messages.at(-1)?.role !== 'user') {
    return json({ error: `Send 1–${MAX_MESSAGES} valid user/assistant messages, ending with a user message.` }, 400)
  }

  try {
    const latestUserText = messages.at(-1).content
    const explicitDestination = /\b(open|show|go to|take me to|navigate to)\b/i.test(latestUserText)
    const asksNearestBlueLight = /\b(where is|find|nearest|closest)\b.{0,48}\b(blue light|emergency phone)/i.test(latestUserText)
    const mayRequestContactAction = /\b(call|text|message)\b/i.test(latestUserText)
    const mayRequestAppAction = (explicitDestination && /\b(home|safety map|map|crime|report|safety gear|contacts|profile|voice|chat|companion|blue light|emergency phone)\b/i.test(latestUserText)) || asksNearestBlueLight || mayRequestContactAction
    if (mayRequestAppAction) {
      const decisionResponse = await fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: openAiHeaders(env.OPENAI_API_KEY),
        body: JSON.stringify({
          model: env.OPENAI_TEXT_MODEL || 'gpt-6-luna',
          instructions: `${knowledgeInstructions(latestUserText)}\n\nUse navigate_to_safe_spark_screen only when the user explicitly asks to open or view a SafeSpark screen. For questions about finding a Blue Light Phone, open the Safety Map. Use request_emergency_contact_action only when the user clearly asks to call, text, or message a contact. The app will match the name against contacts stored on this device and show a confirmation; do not claim that a call or message was sent. Do not navigate merely because a page is mentioned in passing.`,
          input: messages,
          tools: SPARKY_APP_TOOLS,
          tool_choice: 'auto',
          max_output_tokens: 120,
          store: false,
        }),
      })
      if (!decisionResponse.ok) return providerFailure(decisionResponse.status)
      const decision = await parseOpenAiJson(decisionResponse)
      const functionCall = decision?.output?.find((item) => item.type === 'function_call' && ['navigate_to_safe_spark_screen', 'request_emergency_contact_action'].includes(item.name))
      if (functionCall) {
        let argumentsValue
        try { argumentsValue = JSON.parse(functionCall.arguments) } catch { return json({ error: 'Sparky could not validate that app action. Please try again.' }, 502) }
        if (functionCall.name === 'navigate_to_safe_spark_screen') {
          const action = getSparkyAppAction(argumentsValue.screen)
          if (!action) return json({ error: 'That SafeSpark screen is not available.' }, 400)
          return json({ type: 'app_action', action: { screen: action.screen, path: action.path, label: action.label } })
        }
        const contactName = typeof argumentsValue.contact_name === 'string' ? argumentsValue.contact_name.trim().slice(0, 80) : ''
        const actionType = argumentsValue.action
        const message = typeof argumentsValue.message === 'string' ? argumentsValue.message.trim().slice(0, 500) : null
        if (!contactName || !['call', 'text'].includes(actionType) || (actionType === 'text' && !message)) return json({ error: 'Sparky could not validate that contact action.' }, 400)
        return json({ type: 'contact_action', action: { contactName, action: actionType, message: actionType === 'text' ? message : null } })
      }
    }

    const upstream = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: openAiHeaders(env.OPENAI_API_KEY),
      body: JSON.stringify({
        model: env.OPENAI_TEXT_MODEL || 'gpt-6-luna',
        instructions: knowledgeInstructions(messages.at(-1)?.content),
        input: messages,
        max_output_tokens: 600,
        stream: true,
        store: false,
      }),
      signal: request.signal,
    })

    if (!upstream.ok || !upstream.body) return providerFailure()
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch {
    return providerFailure()
  }
}

export async function handleSuggestions(context) {
  const { request, env } = context
  const rejected = checkRequest(request, 'suggestions', 36)
  if (rejected) return rejected
  if (!env.OPENAI_API_KEY) return missingKey()
  const parsed = await readJson(request)
  if (parsed.error) return json({ error: parsed.error }, 400)
  const messages = normalizeMessages(parsed.value?.messages)
  if (!messages || messages.at(-1)?.role !== 'assistant') {
    return json({ error: 'Conversation history must end with Sparky’s latest reply.' }, 400)
  }

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: openAiHeaders(env.OPENAI_API_KEY),
      body: JSON.stringify({
        model: env.OPENAI_TEXT_MODEL || 'gpt-6-luna',
        instructions: `${SPARKY_SYSTEM_PROMPT}\n\nSuggest exactly 3 short, distinct next replies the user might naturally send. Keep each under 12 words, specific to the latest exchange, and avoid generic or repetitive phrasing. Return JSON only as {"suggestions":["...","...","..."]}.`,
        input: messages,
        max_output_tokens: 100,
        store: false,
      }),
    })
    if (!response.ok) return providerFailure(response.status)
    const payload = await parseOpenAiJson(response)
    if (!payload) return providerFailure()
    const raw = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((part) => part.type === 'output_text')?.text || ''
    const match = raw.match(/\{[\s\S]*\}/)
    const result = match ? JSON.parse(match[0]) : null
    const suggestions = Array.isArray(result?.suggestions)
      ? [...new Set(result.suggestions.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].slice(0, 3)
      : []
    return json({ suggestions })
  } catch {
    return providerFailure()
  }
}

export async function handleCompletion(context) {
  const { request, env } = context
  const rejected = checkRequest(request, 'completion', 16)
  if (rejected) return rejected
  if (!env.OPENAI_API_KEY) return missingKey()
  const parsed = await readJson(request)
  if (parsed.error) return json({ error: parsed.error }, 400)
  const draft = typeof parsed.value?.draft === 'string' ? parsed.value.draft.trim() : ''
  const messages = parsed.value?.messages === undefined ? [] : normalizeMessages(parsed.value.messages, { minimum: 0 })
  if (!draft || draft.length > 700 || !messages) return json({ error: 'Provide a draft up to 700 characters and valid recent context.' }, 400)
  if (draft.length < 18) return json({ completion: '' })

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: openAiHeaders(env.OPENAI_API_KEY),
      body: JSON.stringify({
        model: env.OPENAI_TEXT_MODEL || 'gpt-6-luna',
        instructions: `${SPARKY_SYSTEM_PROMPT}\n\nThe user is composing a message. Write only a brief, natural continuation (up to 14 words) for their current draft. Do not repeat, edit, or send the draft. If no continuation would help, return an empty string.`,
        input: [
          ...messages.slice(-6),
          { role: 'user', content: `Current unsent draft (continue after the exact text; return only the continuation):\n${draft}` },
        ],
        max_output_tokens: 50,
        store: false,
      }),
    })
    const payload = await parseOpenAiJson(response)
    if (!payload) return providerFailure()
    const raw = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((part) => part.type === 'output_text')?.text || ''
    return json({ completion: raw.trim().replace(/^['"“”]+|['"“”]+$/g, '').slice(0, 160) })
  } catch {
    return providerFailure()
  }
}

export async function handleRealtimeSession(context) {
  const { request, env } = context
  const rejected = checkRequest(request, 'realtime', 5)
  if (rejected) return rejected
  if (!env.OPENAI_API_KEY) return missingKey()
  const parsed = await readJson(request)
  if (parsed.error) return json({ error: parsed.error }, 400)
  const messages = parsed.value?.messages === undefined ? [] : normalizeMessages(parsed.value.messages, { minimum: 0 })
  if (!messages || messages.length > 12) return json({ error: 'Send at most 12 valid recent messages for voice context.' }, 400)

  const latestUserQuery = [...messages].reverse().find((message) => message.role === 'user')?.content

  try {
    const safetyIdentifier = await openAiSafetyIdentifier(parsed.value?.safety_id)
    const response = await fetch(OPENAI_REALTIME_SECRET_URL, {
      method: 'POST',
      headers: {
        ...openAiHeaders(env.OPENAI_API_KEY),
        ...(safetyIdentifier ? { 'OpenAI-Safety-Identifier': safetyIdentifier } : {}),
      },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 90 },
        session: {
          type: 'realtime',
          model: env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
          instructions: knowledgeInstructions(latestUserQuery),
          tools: SPARKY_REALTIME_TOOLS,
          tool_choice: 'auto',
          audio: {
            input: {
              transcription: { model: 'gpt-realtime-whisper', language: 'en' },
              turn_detection: { type: 'server_vad', create_response: true, interrupt_response: true },
              noise_reduction: { type: 'near_field' },
            },
            output: { voice: env.SPARKY_VOICE || 'marin' },
          },
        },
      }),
    })
    if (!response.ok) {
      let diagnostic = {}
      try {
        const error = await response.clone().json()
        diagnostic = { code: error?.error?.code, param: error?.error?.param }
      } catch { /* Keep provider details out of the client response. */ }
      console.warn('Sparky Realtime configuration rejected by provider', { status: response.status, ...diagnostic })
      return providerFailure(response.status)
    }
    const payload = await parseOpenAiJson(response)
    const clientSecret = payload?.value || payload?.client_secret?.value
    if (!clientSecret) return providerFailure()
    return json({
      client_secret: clientSecret,
      expires_at: payload.expires_at || payload.client_secret?.expires_at || null,
      model: payload.session?.model || env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
    })
  } catch {
    return providerFailure()
  }
}
