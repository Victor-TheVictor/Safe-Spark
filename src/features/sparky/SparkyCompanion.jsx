import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, ArrowLeft, Clock3, Mic, MicOff, Phone, Plus, Send, Settings2, Square, Sparkles, X, Volume2 } from 'lucide-react'
import {
  createRealtimeClientSecret,
  getDraftCompletion,
  getSuggestedReplies,
  streamSparkyReply,
} from './sparkyApi'
import {
  appendSparkyMessage,
  createNewSparkyConversation,
  ensureActiveConversation,
  makeSparkyMessage,
  readSparkyStore,
  storeSparkyPreferences,
  writeSparkyStore,
} from './sparkyStore'
import './SparkyCompanion.css'
import SparkyMarkdown from './SparkyMarkdown'
import { recordSafetyEvent, updateSafetyEventStatus } from './safetyEvents'
import {
  isCurrentLocationRequest,
  isExplicitContactActionRequest,
  resolveContactActionFromRequest,
  resolveSavedEmergencyContact,
} from './contactActions'
import { loadContacts, phoneForAction } from '../emergency-contacts/contactStore'
import { SPARKY_APP_ACTIONS, getSparkyAppAction } from './sparkyActions'
import { transcriptMatchesSafetyPhrase } from './safetyPhrase'

const DEFAULT_SAFETY_PHRASE = 'Red Lantern'
const RECENT_CONTEXT_LIMIT = 16
function asApiMessages(messages, limit = RECENT_CONTEXT_LIMIT) {
  return messages.slice(-limit).map(({ role, content }) => ({ role, content }))
}

function friendlyVoiceError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Microphone access was denied. Allow microphone access in your browser settings, then try again.'
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'No microphone was found. Connect a microphone or use text chat.'
  }
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    return 'The microphone is already in use by another app.'
  }
  if (error?.name === 'TypeError' || /failed to fetch|networkerror/i.test(error?.message || '')) {
    return 'The browser could not reach the voice service. Open the Cloudflare Pages local preview (npm run dev:pages), use HTTPS or localhost, and check your network.'
  }
  if (error?.name === 'AbortError') return 'The voice connection was cancelled.'
  return error?.message || 'Voice could not start. Check your connection and try again.'
}

export default function SparkyCompanion({ profile, path = '/', onNavigate = () => {}, userPosition = null, nearestBlueLight = null, requestLocation = () => {}, locationError = '' }) {
  const profileId = profile?.id || 'local-profile'
  const isVoicePage = path === '/sparky/voice'
  const isChatPage = path === '/sparky/chat' || path === '/companion'
  const isSparkyPage = isVoicePage || isChatPage
  const [store, setStore] = useState(() => ensureActiveConversation(readSparkyStore(profileId)))
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [streamingReply, setStreamingReply] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [completion, setCompletion] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [serviceReady, setServiceReady] = useState(null)
  const [serviceMessage, setServiceMessage] = useState('Checking Sparky connection…')
  const [voiceState, setVoiceState] = useState('idle')
  const [voiceMessage, setVoiceMessage] = useState('')
  const [playbackBlocked, setPlaybackBlocked] = useState(false)
  const [voiceCaption, setVoiceCaption] = useState('')
  const [safetyPhraseDraft, setSafetyPhraseDraft] = useState(store.preferences.safetyPhrase)
  const [microphoneMuted, setMicrophoneMuted] = useState(false)
  const [emergencyActive, setEmergencyActive] = useState(false)
  const [emergencyIsTest, setEmergencyIsTest] = useState(false)
  const [emergencyTimestamp, setEmergencyTimestamp] = useState(null)
  const [emergencyEventId, setEmergencyEventId] = useState(null)
  const [emergencyMessage, setEmergencyMessage] = useState('')
  const [pendingContactAction, setPendingContactAction] = useState(null)
  const [contactActionNotice, setContactActionNotice] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false)

  const activeConversation = store.conversations.find((item) => item.id === store.activeConversationId)
  const messages = useMemo(() => activeConversation?.messages || [], [activeConversation?.messages])
  const sendRef = useRef(false)
  const chatAbortRef = useRef(null)
  const suggestionAbortRef = useRef(null)
  const completionAbortRef = useRef(null)
  const completionCacheRef = useRef(new Map())
  const realtimeRef = useRef({ peer: null, channel: null, microphone: null, audio: null, closing: false, closeTimer: null })
  const voiceStateRef = useRef(voiceState)
  const voiceCancelledRef = useRef(false)
  const assistantTranscriptRef = useRef('')
  const assistantResponseIdsRef = useRef(new Set())
  const userTranscriptIdsRef = useRef(new Set())
  const audioRef = useRef(null)
  const messagesPanelRef = useRef(null)
  const storeRef = useRef(store)
  const outputAnalyserRef = useRef({ context: null, frame: 0, source: null, analyser: null })
  const emergencyTriggeredRef = useRef(false)
  const safetyPhraseTestArmedRef = useRef(false)
  const microphoneMutedRef = useRef(false)
  const pendingHistoryItemsRef = useRef(0)
  const launcherDragRef = useRef(null)
  const suppressLauncherClickRef = useRef(false)
  const handledVoiceToolCallsRef = useRef(new Set())
  const voiceConversationIdRef = useRef(null)
  const latestVoiceUserTranscriptRef = useRef('')
  const [launcherDragging, setLauncherDragging] = useState(false)
  const [launcherPosition, setLauncherPosition] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('safespark-sparky-launcher-position') || 'null')
      return saved && Number.isFinite(saved.left) && Number.isFinite(saved.top) ? saved : null
    } catch { return null }
  })

  useEffect(() => {
    writeSparkyStore(profileId, store)
  }, [profileId, store])

  useEffect(() => { storeRef.current = store }, [store])
  useEffect(() => { voiceStateRef.current = voiceState }, [voiceState])

  useEffect(() => {
    if (!launcherPosition) return undefined
    const clampLauncher = () => {
      const launcher = document.querySelector('.sparky-floating-mascot')
      const { width = 62, height = 62 } = launcher?.getBoundingClientRect() || {}
      const navHeight = document.querySelector('.app-bottom-nav')?.getBoundingClientRect().height || 70
      const next = {
        left: Math.min(Math.max(8, launcherPosition.left), Math.max(8, window.innerWidth - width - 8)),
        top: Math.min(Math.max(8, launcherPosition.top), Math.max(8, window.innerHeight - height - navHeight - 8)),
      }
      if (next.left !== launcherPosition.left || next.top !== launcherPosition.top) {
        setLauncherPosition(next)
        try { localStorage.setItem('safespark-sparky-launcher-position', JSON.stringify(next)) } catch { /* The button stays usable without persisting its position. */ }
      }
    }
    window.addEventListener('resize', clampLauncher)
    clampLauncher()
    return () => window.removeEventListener('resize', clampLauncher)
  }, [launcherPosition])

  useEffect(() => {
    const panel = messagesPanelRef.current
    if (!panel) return undefined
    const frame = requestAnimationFrame(() => {
      panel.scrollTo({ top: panel.scrollHeight, behavior: streamingReply || isChatPage ? 'auto' : 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [isChatPage, messages, streamingReply, sending])

  useEffect(() => {
    let active = true
    fetch('/api/sparky/health', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Sparky service is not reachable.')
        return response.json()
      })
      .then((health) => {
        if (!active) return
        setServiceReady(health.configured === true)
        setServiceMessage(health.configured === true
          ? 'Connected to Sparky AI'
          : 'Sparky is waiting for its secure API key')
      })
      .catch(() => {
        if (!active) return
        setServiceReady(false)
        setServiceMessage('Sparky API is not reachable. For local full-stack use, restart with “npm run dev” and open http://localhost:5173.')
      })
    return () => { active = false }
  }, [])

  function updateStore(updater) {
    setStore(updater)
  }

  function appendMessage(conversationId, message) {
    updateStore((current) => appendSparkyMessage(current, conversationId, message))
  }

  function addVoiceTranscript(role, content, dedupeId) {
    if (!content?.trim()) return
    const usedIds = role === 'user' ? userTranscriptIdsRef.current : assistantResponseIdsRef.current
    const key = dedupeId || content.trim()
    if (usedIds.has(key)) return
    usedIds.add(key)
    const conversationId = voiceConversationIdRef.current || storeRef.current.activeConversationId
    appendMessage(conversationId, makeSparkyMessage(conversationId, role, content.trim(), 'voice'))
  }

  function setLiveVoiceState(nextState) {
    voiceStateRef.current = nextState
    setVoiceState(nextState)
  }

  const cleanupVoice = useCallback(() => {
    const state = realtimeRef.current
    window.clearTimeout(state.closeTimer)
    state.closing = true
    try {
      state.channel?.close()
      state.peer?.close()
    } catch { /* Continue stopping local audio tracks. */ }
    state.microphone?.getTracks().forEach((track) => track.stop())
    if (state.audio) state.audio.srcObject = null
    const output = outputAnalyserRef.current
    if (output.frame) cancelAnimationFrame(output.frame)
    output.context?.close().catch(() => {})
    outputAnalyserRef.current = { context: null, frame: 0, source: null, analyser: null }
    realtimeRef.current = { peer: null, channel: null, microphone: null, audio: null, closing: false, closeTimer: null }
    assistantTranscriptRef.current = ''
    voiceConversationIdRef.current = null
    if (voiceStateRef.current !== 'error') setLiveVoiceState('idle')
  }, [])

  useEffect(() => () => {
    chatAbortRef.current?.abort()
    suggestionAbortRef.current?.abort()
    completionAbortRef.current?.abort()
    voiceCancelledRef.current = true
    cleanupVoice()
  }, [cleanupVoice])

  useEffect(() => {
    completionAbortRef.current?.abort()
    if (!isChatPage || sending || draft.trim().length < 24) return undefined
    const cacheKey = `${store.activeConversationId}:${draft.trim()}`
    const cached = completionCacheRef.current.get(cacheKey)
    if (cached) {
      setCompletion(cached)
      return undefined
    }
    const controller = new AbortController()
    completionAbortRef.current = controller
    const timer = window.setTimeout(async () => {
      try {
        const candidate = await getDraftCompletion(draft, asApiMessages(messages.slice(-8)), { signal: controller.signal })
        if (!controller.signal.aborted && candidate) {
          completionCacheRef.current.set(cacheKey, candidate)
          setCompletion(candidate)
        }
      } catch { /* Draft completion is optional; chat remains available. */ }
    }, 950)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [draft, messages, isChatPage, sending, store.activeConversationId])

  function beginNewConversation() {
    chatAbortRef.current?.abort()
    suggestionAbortRef.current?.abort()
    setSuggestions([])
    setErrorMessage('')
    setDraft('')
    setCompletion('')
    setStreamingReply('')
    updateStore((current) => createNewSparkyConversation(current))
    setConversationMenuOpen(false)
  }

  function selectConversation(conversationId) {
    chatAbortRef.current?.abort()
    suggestionAbortRef.current?.abort()
    setDraft('')
    setCompletion('')
    setStreamingReply('')
    setSuggestions([])
    setErrorMessage('')
    updateStore((current) => ({ ...current, activeConversationId: conversationId }))
    setConversationMenuOpen(false)
  }

  async function sendMessage(value = draft, inputMode = 'text') {
    const text = value.trim()
    if (!text || sendRef.current || !activeConversation) return
    const conversationId = activeConversation.id
    const userMessage = makeSparkyMessage(conversationId, 'user', text, inputMode)
    appendMessage(conversationId, userMessage)
    if (inputMode === 'text') setDraft('')

    if (isCurrentLocationRequest(text)) {
      let reply
      if (userPosition) {
        const latitude = userPosition.latitude.toFixed(6)
        const longitude = userPosition.longitude.toFixed(6)
        const accuracy = Number.isFinite(userPosition.accuracyMeters) ? ` (GPS accuracy about ±${Math.round(userPosition.accuracyMeters)} m)` : ''
        const mapUrl = `https://maps.google.com/?q=${latitude},${longitude}`
        const facility = nearestBlueLight?.facilities?.[0]
        const facilityName = facility?.description || facility?.name
        const distance = nearestBlueLight?.distanceMeters
        const nearby = facilityName && Number.isFinite(distance)
          ? `\n\nNearest Blue Light Phone: ${facilityName}, ${distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(2)} km`} away in a straight line (not walking distance).`
          : ''
        reply = `Your current GPS location is **${latitude}, ${longitude}**${accuracy}.${nearby}\n\n[Open these coordinates in Google Maps](${mapUrl}). Your coordinates are handled on this device and are not sent to Sparky's AI.`
      } else {
        requestLocation()
        reply = locationError
          ? `${locationError} Once location access is allowed, ask “Where am I?” again and I’ll show your current coordinates.`
          : 'I need your permission to read GPS first. Allow location access in the browser prompt; then ask “Where am I?” again. I will keep the coordinates on this device.'
      }
      appendMessage(conversationId, makeSparkyMessage(conversationId, 'assistant', reply, inputMode))
      setSuggestions([])
      setErrorMessage('')
      return
    }

    if (isExplicitContactActionRequest(text)) {
      const prepared = prepareContactAction({}, text)
      const reply = prepared?.resolution === 'ambiguous'
        ? `I found more than one saved contact in that request: ${prepared.matches.join(', ')}. Please name just one person.`
        : prepared?.resolution === 'not_found' ? `I couldn't find “${prepared.requestedName}” in Emergency Contacts. Save that person there first, then ask me again.`
          : prepared?.resolution === 'invalid_phone' ? `The saved phone number for ${prepared.contactName} is incomplete. Update that contact before calling or texting.`
            : prepared?.resolution === 'invalid' ? 'Tell me which saved contact to call or text. For a text, include the message you want to send.'
              : `Please confirm the ${prepared.action} action for ${prepared.contact.name} below.`
      appendMessage(conversationId, makeSparkyMessage(conversationId, 'assistant', reply, inputMode))
      setErrorMessage('')
      setSuggestions([])
      return
    }

    if (serviceReady === false) {
      setErrorMessage(serviceMessage)
      return
    }
    sendRef.current = true
    setSending(true)
    setErrorMessage('')
    setSuggestions([])
    setCompletion('')
    suggestionAbortRef.current?.abort()
    const previousMessages = activeConversation.messages
    const requestMessages = asApiMessages([...previousMessages, userMessage])
    const controller = new AbortController()
    chatAbortRef.current = controller
    setStreamingReply('')
    let partialReply = ''
    try {
      const result = await streamSparkyReply(requestMessages, {
        signal: controller.signal,
        onDelta: (_delta, accumulated) => {
          partialReply = accumulated
          setStreamingReply(accumulated)
        },
      })
      if (result?.type === 'app_action') {
        const action = getSparkyAppAction(result.action?.screen)
        if (!action) throw new Error('Sparky requested a screen that is not available.')
        appendMessage(conversationId, makeSparkyMessage(conversationId, 'assistant', `Opening ${action.label}.`, inputMode))
        runAppAction(action)
        return
      }
      if (result?.type === 'contact_action') {
        const prepared = prepareContactAction(result.action, text)
        const status = prepared?.resolution === 'ambiguous'
          ? `I found more than one matching contact: ${prepared.matches.join(', ')}. Which person do you mean?`
          : prepared?.resolution === 'not_found' ? `I couldn't find “${prepared.requestedName}” in your saved Emergency Contacts. Check the saved name and try again.`
            : prepared?.resolution === 'invalid_phone' ? `The saved phone number for ${prepared.contactName} is incomplete. Update that contact before calling or texting.`
              : prepared?.resolution === 'invalid' ? 'I could not prepare that contact action. Ask me to call or text a saved contact and include the message.'
                : `Please confirm the ${prepared.action} action for ${prepared.contact.name} below.`
        appendMessage(conversationId, makeSparkyMessage(conversationId, 'assistant', status, inputMode))
        return
      }
      const fullReply = result
      if (fullReply.trim()) {
        const assistantMessage = makeSparkyMessage(conversationId, 'assistant', fullReply.trim(), inputMode)
        appendMessage(conversationId, assistantMessage)
        const nextContext = [...requestMessages, { role: 'assistant', content: fullReply.trim() }].slice(-RECENT_CONTEXT_LIMIT)
        const nextController = new AbortController()
        suggestionAbortRef.current = nextController
        getSuggestedReplies(nextContext, { signal: nextController.signal })
          .then((items) => {
            if (!nextController.signal.aborted && storeRef.current.activeConversationId === conversationId) {
              setSuggestions(items)
            }
          })
          .catch(() => { /* Suggestions never block the response. */ })
      }
    } catch (error) {
      if (error.name === 'AbortError' && partialReply.trim()) {
        appendMessage(conversationId, makeSparkyMessage(conversationId, 'assistant', partialReply.trim(), inputMode))
      } else if (error.name !== 'AbortError') {
        setErrorMessage(error.message || 'Sparky could not reply. Please try again.')
      }
    } finally {
      setStreamingReply('')
      sendRef.current = false
      setSending(false)
      if (chatAbortRef.current === controller) chatAbortRef.current = null
    }
  }

  function stopGeneration() {
    chatAbortRef.current?.abort()
  }

  function handleRealtimeEvent(event) {
    if (event.type === 'session.closed') {
      cleanupVoice()
      setVoiceMessage('Voice session ended.')
      return
    }
    if (event.type === 'error') {
      setVoiceMessage('Voice connection returned an error. End the session and try again.')
      setLiveVoiceState('error')
      cleanupVoice()
      return
    }
    if (event.type === 'session.created' || event.type === 'session.updated') {
      return
    }
    if (event.type === 'conversation.item.created' && pendingHistoryItemsRef.current > 0) {
      pendingHistoryItemsRef.current -= 1
      if (pendingHistoryItemsRef.current === 0) {
        realtimeRef.current.microphone?.getAudioTracks().forEach((track) => { track.enabled = !microphoneMutedRef.current })
        setLiveVoiceState('listening')
        setVoiceMessage('Listening. Speak naturally; you can interrupt Sparky at any time.')
      }
      return
    }
    if (event.type === 'input_audio_buffer.speech_started') {
      if (voiceStateRef.current === 'speaking') {
        setLiveVoiceState('interrupted')
        window.setTimeout(() => {
          if (voiceStateRef.current === 'interrupted') setLiveVoiceState('listening')
        }, 450)
      } else {
        setLiveVoiceState('listening')
      }
      return
    }
    if (event.type === 'response.created') {
      assistantTranscriptRef.current = ''
      setVoiceCaption('')
      setLiveVoiceState('thinking')
      return
    }
    if (event.type === 'response.function_call_arguments.done') {
      executeVoiceTool(event.name, event.arguments, event.call_id)
      return
    }
    if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
      executeVoiceTool(event.item.name, event.item.arguments, event.item.call_id)
      return
    }
    if (event.type === 'response.output_audio_buffer.started' || event.type === 'response.output_audio.delta') {
      setLiveVoiceState('speaking')
    }
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      latestVoiceUserTranscriptRef.current = event.transcript || ''
      addVoiceTranscript('user', event.transcript, event.item_id)
      if (!emergencyTriggeredRef.current && (storeRef.current.preferences.safetyPhraseEnabled || safetyPhraseTestArmedRef.current) && transcriptMatchesSafetyPhrase(event.transcript || '', storeRef.current.preferences.safetyPhrase)) {
        const isTest = safetyPhraseTestArmedRef.current
        emergencyTriggeredRef.current = true
        setEmergencyActive(true)
        setEmergencyIsTest(isTest)
        safetyPhraseTestArmedRef.current = false
        const timestamp = new Date().toISOString()
        setEmergencyTimestamp(timestamp)
        if (!isTest) {
          const savedEvent = recordSafetyEvent(profileId, { type: 'safety_phrase', timestamp })
          setEmergencyEventId(savedEvent?.id || null)
        }
        setVoiceMessage(isTest
          ? 'Test phrase recognized. No contact was called or messaged.'
          : 'Safety phrase heard during this active voice session. Review the actions below; nothing has been sent.')
      }
      return
    }
    if (event.type === 'response.output_audio_transcript.delta' || event.type === 'response.output_text.delta') {
      assistantTranscriptRef.current += event.delta || ''
      setVoiceCaption(assistantTranscriptRef.current)
      setLiveVoiceState('speaking')
      return
    }
    if (event.type === 'response.output_audio_transcript.done' || event.type === 'response.output_text.done') {
      const transcript = event.transcript || event.text || assistantTranscriptRef.current
      const responseId = event.response_id || event.item_id
      addVoiceTranscript('assistant', transcript, responseId)
      assistantTranscriptRef.current = ''
      setVoiceCaption('')
      setLiveVoiceState('listening')
      return
    }
    if (event.type === 'response.done') {
      const transcript = assistantTranscriptRef.current.trim()
      if (transcript) addVoiceTranscript('assistant', transcript, event.response?.id)
      assistantTranscriptRef.current = ''
      setVoiceCaption('')
      setLiveVoiceState('listening')
    }
  }

  function executeVoiceTool(name, rawArguments, callId) {
    if (!['navigate_to_safe_spark_screen', 'request_emergency_contact_action', 'get_current_location'].includes(name) || typeof callId !== 'string' || handledVoiceToolCallsRef.current.has(callId)) return
    handledVoiceToolCallsRef.current.add(callId)
    let args
    try { args = JSON.parse(rawArguments) } catch { args = null }
    const channel = realtimeRef.current.channel
    if (channel?.readyState !== 'open') return
    let toolOutput
    if (name === 'get_current_location') {
      if (!userPosition) {
        requestLocation()
        toolOutput = { available: false, message: 'No current GPS fix is available yet. The app has requested permission locally. Ask the user to allow the browser location prompt and try again; do not guess.' }
      } else {
        const facility = nearestBlueLight?.facilities?.[0]
        toolOutput = {
          available: true,
          latitude: Number(userPosition.latitude.toFixed(6)),
          longitude: Number(userPosition.longitude.toFixed(6)),
          accuracy_meters: Number.isFinite(userPosition.accuracyMeters) ? Math.round(userPosition.accuracyMeters) : null,
          nearest_blue_light: facility ? {
            name: facility.description || facility.name || 'Blue Light Phone on the Safety Map',
            straight_line_distance_meters: Number.isFinite(nearestBlueLight?.distanceMeters) ? Math.round(nearestBlueLight.distanceMeters) : null,
          } : null,
          note: 'These are permissioned device coordinates for this explicit request. Distance is straight-line, not walking distance.',
        }
      }
    } else if (name === 'navigate_to_safe_spark_screen') {
      const action = getSparkyAppAction(args?.screen)
      if (!action) toolOutput = { opened: false, reason: 'Screen is not allowlisted.' }
      else { onNavigate(action.path); toolOutput = { opened: true, screen: action.label } }
    } else {
      const prepared = prepareContactAction(args, latestVoiceUserTranscriptRef.current)
      toolOutput = prepared?.resolution === 'ambiguous'
        ? { confirmation_required: false, reason: 'Multiple contacts match.', matches: prepared.matches }
        : prepared?.resolution === 'not_found' ? { confirmation_required: false, reason: `No saved contact named ${prepared.requestedName} matched.` }
          : prepared?.resolution === 'invalid_phone' ? { confirmation_required: false, reason: `The saved phone number for ${prepared.contactName} is invalid.` }
            : prepared?.resolution === 'invalid' ? { confirmation_required: false, reason: 'Contact action arguments were incomplete.' }
              : { confirmation_required: true, contact: prepared.contact.name, action: prepared.action }
    }
    channel.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(toolOutput) } }))
    channel.send(JSON.stringify({ type: 'response.create' }))
    const status = name === 'get_current_location'
      ? toolOutput.available ? 'Your current position was provided for this request only.' : 'Location is not available yet. Allow the browser permission and ask again.'
      : name === 'navigate_to_safe_spark_screen' && toolOutput.opened ? `Opening ${toolOutput.screen}.`
        : name === 'request_emergency_contact_action' && toolOutput.confirmation_required ? `Please confirm the ${toolOutput.action} action for ${toolOutput.contact} on this screen.`
          : toolOutput.matches?.length ? `Several saved contacts matched: ${toolOutput.matches.join(', ')}. Please clarify which person you mean.`
            : toolOutput.reason || 'I could not verify that action. Check your saved contacts or try again.'
    setVoiceMessage(status)
  }

  function prepareContactAction(args, userMessage = '') {
    const resolved = resolveContactActionFromRequest(args, userMessage, loadContacts())
    if (resolved.contact_matches?.length > 1) return { resolution: 'ambiguous', matches: resolved.contact_matches }
    const requestedName = resolved.contact_name || resolved.requested_name
    const action = resolved.action
    const message = resolved.message.slice(0, 500)
    if (!requestedName || !['call', 'text'].includes(action) || (action === 'text' && !message)) return { resolution: 'invalid' }
    const match = resolveSavedEmergencyContact(loadContacts(), requestedName)
    if (match.matches.length > 1) return { resolution: 'ambiguous', matches: match.matches.map((contact) => contact.name) }
    if (!match.contact) return { resolution: 'not_found', requestedName }
    const contact = match.contact
    const phone = phoneForAction(contact.phone)
    if (phone.replace(/\D/g, '').length < 7) return { resolution: 'invalid_phone', contactName: contact.name }
    const prepared = { conversationId: voiceConversationIdRef.current || storeRef.current.activeConversationId, contact: { id: contact.id, name: contact.name, phone }, action, message: action === 'text' ? message : null }
    setContactActionNotice('')
    setPendingContactAction(prepared)
    return prepared
  }

  function launchContactAction() {
    if (!pendingContactAction) return
    const { action, contact, conversationId } = pendingContactAction
    const status = action === 'call'
      ? `Your phone app is opening for ${contact.name}. SafeSpark cannot confirm the call.`
      : `Your messaging app is opening for ${contact.name}. Review and send the message there; delivery is not confirmed.`
    if (conversationId) appendMessage(conversationId, makeSparkyMessage(conversationId, 'assistant', status, isVoicePage ? 'voice' : 'text'))
    setVoiceMessage(status)
    setPendingContactAction((current) => current ? { ...current, handedOff: true } : current)
    setContactActionNotice(action === 'text'
      ? 'Messages should open with this draft. Review and tap Send there; SafeSpark cannot send it or confirm delivery. You can also copy the message below.'
      : 'Your phone app should open. Complete the call there; SafeSpark cannot place or confirm it.')
  }

  async function copyContactMessage() {
    const message = pendingContactAction?.message
    if (!message) return
    try {
      await navigator.clipboard.writeText(message)
      setContactActionNotice('Message copied. Open Messages, paste it, review the recipient, and tap Send.')
    } catch {
      setContactActionNotice('Copy is unavailable in this browser. Select and copy the message shown above, then paste it into Messages.')
    }
  }

  async function startVoice() {
    if (!serviceReady) {
      setLiveVoiceState('error')
      setVoiceMessage(serviceReady === false ? serviceMessage : 'Checking the Sparky service. Try again in a moment.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      setLiveVoiceState('error')
      setVoiceMessage('This browser does not support WebRTC microphone conversations. Use text chat instead.')
      return
    }

    voiceCancelledRef.current = false
    voiceConversationIdRef.current = activeConversation?.id || storeRef.current.activeConversationId
    handledVoiceToolCallsRef.current.clear()
    emergencyTriggeredRef.current = false
    setMicrophoneMuted(false)
    microphoneMutedRef.current = false
    setLiveVoiceState('requesting_permission')
    setVoiceMessage('')
    let microphone
    let peer
    try {
      microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      microphone.getAudioTracks().forEach((track) => { track.enabled = false })
      if (voiceCancelledRef.current) {
        microphone.getTracks().forEach((track) => track.stop())
        return
      }
      const temporary = await createRealtimeClientSecret(asApiMessages(messages, 12), { safetyId: profileId })
      if (voiceCancelledRef.current) {
        microphone.getTracks().forEach((track) => track.stop())
        return
      }
      peer = new RTCPeerConnection()
      const audio = audioRef.current
      if (!audio) throw new Error('Voice audio output is unavailable in this browser.')
      audio.autoplay = true
      audio.setAttribute('playsinline', 'true')
      peer.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream([event.track])
        audio.srcObject = stream
        audio.play().then(() => setPlaybackBlocked(false)).catch(() => { setPlaybackBlocked(true); setVoiceMessage('Audio playback is blocked. Tap “Enable voice audio” to hear Sparky.') })
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext
          const context = new AudioContextClass()
          const source = context.createMediaStreamSource(stream)
          const analyser = context.createAnalyser()
          const silent = context.createGain()
          analyser.fftSize = 256
          silent.gain.value = 0
          source.connect(analyser)
          analyser.connect(silent)
          silent.connect(context.destination)
          const samples = new Uint8Array(analyser.fftSize)
          const tick = () => {
            analyser.getByteTimeDomainData(samples)
            let energy = 0
            for (const sample of samples) energy += ((sample - 128) / 128) ** 2
            const amplitude = Math.min(1, Math.sqrt(energy / samples.length) * 4)
            document.querySelectorAll('.sparky-mascot-frame').forEach((frame) => frame.style.setProperty('--mouth-open', String(amplitude)))
            outputAnalyserRef.current.frame = requestAnimationFrame(tick)
          }
          outputAnalyserRef.current = { context, source, analyser, frame: requestAnimationFrame(tick) }
        } catch { /* Voice remains usable if audio amplitude analysis is unavailable. */ }
      }
      microphone.getAudioTracks().forEach((track) => peer.addTrack(track, microphone))
      const channel = peer.createDataChannel('oai-events')
      channel.onclose = () => {
        if (realtimeRef.current.channel !== channel || realtimeRef.current.closing) return
        setLiveVoiceState('error')
        setVoiceMessage('The voice connection closed. Start a new session or use text chat.')
        cleanupVoice()
      }
      channel.onopen = () => {
        const history = asApiMessages(messages, 12)
        pendingHistoryItemsRef.current = history.length
        setLiveVoiceState(history.length ? 'connecting' : 'listening')
        setVoiceMessage(history.length ? 'Restoring this conversation…' : 'Listening. Speak naturally; you can interrupt Sparky at any time.')
        for (const message of history) {
          const type = message.role === 'user' ? 'input_text' : 'output_text'
          channel.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: message.role, content: [{ type, text: message.content }] } }))
        }
        if (!history.length) microphone.getAudioTracks().forEach((track) => { track.enabled = !microphoneMutedRef.current })
      }
      channel.onmessage = ({ data }) => {
        try { handleRealtimeEvent(JSON.parse(data)) } catch { /* Ignore malformed event frames. */ }
      }
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') window.clearTimeout(realtimeRef.current.closeTimer)
        if (peer.connectionState === 'disconnected' && !realtimeRef.current.closing) {
          realtimeRef.current.closeTimer = window.setTimeout(() => {
            if (peer.connectionState !== 'disconnected' || realtimeRef.current.closing) return
            setLiveVoiceState('error')
            setVoiceMessage('The voice connection dropped. Check your connection and try again.')
            cleanupVoice()
          }, 3_000)
        }
        if (peer.connectionState === 'failed' && !realtimeRef.current.closing) {
          setLiveVoiceState('error')
          setVoiceMessage('The voice connection dropped. Check your connection and try again.')
          cleanupVoice()
        }
      }
      realtimeRef.current = { peer, channel, microphone, audio, closing: false, closeTimer: null }
      setLiveVoiceState('connecting')
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      if (peer.iceGatheringState !== 'complete') {
        await new Promise((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error('Voice connection timed out while preparing media.')), 10_000)
          function onGathering() {
            if (peer.iceGatheringState === 'complete') {
              window.clearTimeout(timeout)
              peer.removeEventListener('icegatheringstatechange', onGathering)
              resolve()
            }
          }
          peer.addEventListener('icegatheringstatechange', onGathering)
          onGathering()
        })
      }
      const sdp = peer.localDescription?.sdp
      if (!sdp) throw new Error('The browser did not create a voice connection offer.')
      if (voiceCancelledRef.current) throw new DOMException('Voice connection cancelled.', 'AbortError')
      const answerResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${temporary.client_secret}`,
          'Content-Type': 'application/sdp',
        },
        body: sdp,
      })
      if (voiceCancelledRef.current) throw new DOMException('Voice connection cancelled.', 'AbortError')
      if (!answerResponse.ok) {
        let providerCode = ''
        try { providerCode = (await answerResponse.json())?.error?.code || '' } catch { /* Do not expose response bodies or credentials in UI. */ }
        if (answerResponse.status === 401 || answerResponse.status === 403) throw new Error('OpenAI rejected the temporary voice credential. Check the Cloudflare API secret and Realtime model access, then retry.')
        if (answerResponse.status === 429) throw new Error('OpenAI Realtime is over quota or rate limited. Check project billing and limits.')
        if (answerResponse.status === 400) throw new Error(`OpenAI rejected the voice session configuration${providerCode ? ` (${providerCode})` : ''}. Check the Realtime model and settings.`)
        throw new Error(`The voice handshake failed (HTTP ${answerResponse.status}). Check the connection and try again.`)
      }
      const answerSdp = await answerResponse.text()
      await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp })
    } catch (error) {
      microphone?.getTracks().forEach((track) => track.stop())
      if (peer && peer !== realtimeRef.current.peer) peer.close()
      cleanupVoice()
      if (!voiceCancelledRef.current || error.name !== 'AbortError') {
        setLiveVoiceState('error')
        setVoiceMessage(friendlyVoiceError(error))
      }
    }
  }

  function endVoice({ immediate = false } = {}) {
    voiceCancelledRef.current = true
    const channel = realtimeRef.current.channel
    if (channel?.readyState === 'open') {
      try {
        channel.send(JSON.stringify({ type: 'session.close' }))
        if (immediate) {
          cleanupVoice()
          setVoiceMessage('Voice session ended.')
          return
        }
        realtimeRef.current.closeTimer = window.setTimeout(() => {
          cleanupVoice()
          setVoiceMessage('Voice session ended.')
        }, 5_000)
        setVoiceMessage('Ending voice session…')
        return
      } catch { /* Close local media even if the remote channel has failed. */ }
    }
    cleanupVoice()
  }

  function toggleMicrophoneMute() {
    const nextMuted = !microphoneMuted
    realtimeRef.current.microphone?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted })
    microphoneMutedRef.current = nextMuted
    setMicrophoneMuted(nextMuted)
    setVoiceMessage(nextMuted ? 'Microphone muted. Safety phrase detection is paused.' : 'Microphone on. Safety phrase detection is active during this voice session.')
  }

  function saveSafetyPhrase() {
    const phrase = safetyPhraseDraft.trim().slice(0, 40)
    if (!/[\p{L}\p{N}]/u.test(phrase)) {
      setVoiceMessage('Enter a safety phrase with at least one letter or number.')
      return
    }
    updateStore((current) => storeSparkyPreferences(current, { safetyPhrase: phrase }))
    setSafetyPhraseDraft(phrase)
    setVoiceMessage(`Saved safety phrase: “${phrase}”.`)
  }

  function resetSafetyPhrase() {
    updateStore((current) => storeSparkyPreferences(current, { safetyPhrase: DEFAULT_SAFETY_PHRASE }))
    setSafetyPhraseDraft(DEFAULT_SAFETY_PHRASE)
    setVoiceMessage(`Restored default safety phrase: “${DEFAULT_SAFETY_PHRASE}”.`)
  }

  function testSafetyPhrase() {
    if (!['listening', 'speaking', 'thinking'].includes(voiceState)) {
      setVoiceMessage('Start an active voice session first, then tap Test safely and say your phrase. No background listening is used.')
      return
    }
    safetyPhraseTestArmedRef.current = true
    setVoiceMessage('Test armed. Say your phrase during this active voice session; no calls or messages will be sent.')
  }

  function runAppAction(action) {
    const allowed = getSparkyAppAction(action?.screen)
    if (!allowed) return
    onNavigate(allowed.path)
  }

  function handleLauncherPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    suppressLauncherClickRef.current = false
    const rect = event.currentTarget.getBoundingClientRect()
    launcherDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height, moved: false, position: launcherPosition }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Pointer capture is optional in older Safari versions. */ }
  }

  function handleLauncherPointerMove(event) {
    const drag = launcherDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < 6) return
    drag.moved = true
    suppressLauncherClickRef.current = true
    setLauncherDragging(true)
    const navHeight = document.querySelector('.app-bottom-nav')?.getBoundingClientRect().height || 70
    const position = {
      left: Math.min(Math.max(8, drag.left + dx), Math.max(8, window.innerWidth - drag.width - 8)),
      top: Math.min(Math.max(8, drag.top + dy), Math.max(8, window.innerHeight - drag.height - navHeight - 8)),
    }
    drag.position = position
    setLauncherPosition(position)
  }

  function handleLauncherPointerUp(event) {
    const drag = launcherDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    launcherDragRef.current = null
    if (drag.moved) {
      try { localStorage.setItem('safespark-sparky-launcher-position', JSON.stringify(drag.position)) } catch { /* Position is a convenience, not required state. */ }
      setLauncherDragging(false)
    } else {
      suppressLauncherClickRef.current = false
    }
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* Pointer capture may already be released. */ }
  }

  function openSmsComposer(contact) {
    const number = phoneForAction(contact?.phone)
    if (!number) return
    const timestamp = emergencyTimestamp ? new Date(emergencyTimestamp).toLocaleString() : new Date().toLocaleString()
    const coordinates = userPosition ? ` Current location: https://maps.google.com/?q=${userPosition.latitude},${userPosition.longitude}` : ''
    const body = `SafeSpark safety check requested by ${profile?.name || 'a SafeSpark user'} at ${timestamp}.${coordinates}`
    if (emergencyEventId) updateSafetyEventStatus(profileId, emergencyEventId, 'sms_composer_opened_unconfirmed')
    window.location.assign(`sms:${number}?&body=${encodeURIComponent(body)}`)
    setEmergencyMessage('Your messaging app is opening. Review and send the message there; SafeSpark cannot confirm delivery.')
  }

  const recentConversations = useMemo(
    () => [...store.conversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 8),
    [store.conversations],
  )

  if (!isSparkyPage) return (
    <>
      <audio ref={audioRef} className="sparky-audio-output" autoPlay playsInline aria-label="Sparky voice response audio" />
      <button className={`sparky-floating-mascot${voiceState === 'speaking' ? ' is-speaking' : ''}${emergencyActive ? ' is-emergency' : ''}${launcherDragging ? ' is-dragging' : ''}`} type="button" aria-label={voiceState !== 'idle' && voiceState !== 'error' ? 'Return to active Sparky voice conversation' : 'Open Sparky text chat'} title="Drag to move · activate to open Sparky" style={launcherPosition ? { left: `${launcherPosition.left}px`, top: `${launcherPosition.top}px`, right: 'auto', bottom: 'auto' } : undefined} onPointerDown={handleLauncherPointerDown} onPointerMove={handleLauncherPointerMove} onPointerUp={handleLauncherPointerUp} onPointerCancel={handleLauncherPointerUp} onClick={(event) => { if (suppressLauncherClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressLauncherClickRef.current = false; return } onNavigate(voiceState !== 'idle' && voiceState !== 'error' ? '/sparky/voice' : '/sparky/chat') }} onDragStart={(event) => event.preventDefault()}>
        <span className="sparky-mascot-frame"><img className="sparky-mascot-image" src="/assets/brand/sparky-mascot.png" alt=""/><span className="sparky-mouth" aria-hidden="true" /></span>
        {voiceState === 'listening' && <span className="sparky-floating-status" aria-label="Sparky is listening" />}
      </button>
    </>
  )

  const contacts = loadContacts()
  const currentCoordinates = userPosition ? `${userPosition.latitude.toFixed(5)}, ${userPosition.longitude.toFixed(5)}` : null

  return (
    <>
    <audio ref={audioRef} className="sparky-audio-output" autoPlay playsInline aria-label="Sparky voice response audio" />
    <main className={`sparky-page sparky-route-page${isVoicePage ? ' is-voice-page' : ' is-chat-page'}`} aria-label={isVoicePage ? 'Sparky voice conversation' : 'Sparky text conversation'}>
      <header className="sparky-route-header">
        <button className="sparky-back-button" type="button" onClick={() => onNavigate('/')} aria-label="Back to SafeSpark"><ArrowLeft size={18} /> <span>SafeSpark</span></button>
        <div className="sparky-route-brand"><img src="/assets/brand/sparky-mascot.png" alt="" /><span>Sparky</span></div>
        <nav className="sparky-route-switch" aria-label="Sparky conversation type">
          <button type="button" className={!isVoicePage ? 'is-active' : ''} aria-current={!isVoicePage ? 'page' : undefined} onClick={() => { setCompletion(''); onNavigate('/sparky/chat') }}>Text chat</button>
          <button type="button" className={isVoicePage ? 'is-active' : ''} aria-current={isVoicePage ? 'page' : undefined} onClick={() => onNavigate('/sparky/voice')}>Voice</button>
        </nav>
      </header>

      <section className="sparky-route-content">
        <header className="sparky-page-heading">
          <div className="sparky-page-title-group"><div><p className="section-kicker">SAFE SPARK COMPANION</p><h1>{isVoicePage ? 'Voice conversation' : 'How can I help?'}</h1></div></div>
          <div className="sparky-heading-actions">
            {!isVoicePage && <button className="sparky-secondary-button" type="button" aria-expanded={conversationMenuOpen} onClick={() => setConversationMenuOpen((open) => !open)}><Clock3 size={16} aria-hidden="true" /> History</button>}
            {!isVoicePage && <button className="sparky-secondary-button" type="button" onClick={beginNewConversation}><Plus size={16} aria-hidden="true" /> New chat</button>}
            <button className="sparky-settings-trigger" type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}><Settings2 size={17} aria-hidden="true" /> Settings</button>
          </div>
        </header>

        <div className="sparky-connection-row" role="status" aria-live="polite"><span className={`sparky-connection-dot${serviceReady ? ' is-ready' : ''}`} /><span>{serviceMessage}</span></div>

        {conversationMenuOpen && !isVoicePage && <div className="sparky-history-menu" aria-label="Recent conversations">{recentConversations.map((conversation) => <button type="button" key={conversation.id} className={conversation.id === activeConversation?.id ? 'is-active' : ''} onClick={() => selectConversation(conversation.id)}><span>{conversation.title}</span><small>{conversation.messages.length} messages</small></button>)}</div>}

        {settingsOpen && <section className="sparky-settings-panel" aria-labelledby="sparky-settings-title">
          <div className="sparky-settings-header"><div><p className="section-kicker">VOICE PRIVACY</p><h2 id="sparky-settings-title">Safety phrase</h2></div><button className="sparky-icon-button" type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={18} /></button></div>
          <label className="sparky-wake-toggle"><span><strong>Enable safety phrase</strong><small>Detected only while an active Sparky voice session is listening.</small></span><input type="checkbox" checked={store.preferences.safetyPhraseEnabled} onChange={(event) => updateStore((current) => storeSparkyPreferences(current, { safetyPhraseEnabled: event.target.checked }))} /></label>
          <label className="sparky-trigger-label" htmlFor="sparky-trigger">Your phrase</label>
          <div className="sparky-trigger-row"><input id="sparky-trigger" value={safetyPhraseDraft} maxLength={40} onChange={(event) => setSafetyPhraseDraft(event.target.value)} placeholder="Red Lantern" /><button type="button" className="sparky-secondary-button" onClick={saveSafetyPhrase}>Save</button><button type="button" className="sparky-text-button" onClick={resetSafetyPhrase}>Restore default</button></div>
          <div className="sparky-wake-actions"><button type="button" className="sparky-secondary-button" onClick={testSafetyPhrase} disabled={safetyPhraseDraft !== store.preferences.safetyPhrase}>Test safely</button></div>
          <p className="sparky-privacy-note">No audio is monitored in the background. Phrase detection uses transcription only during an active voice session. A test never contacts anyone.</p>{voiceMessage && <p className="sparky-inline-status" role="status">{voiceMessage}</p>}
        </section>}

        {isChatPage ? <section className="sparky-chat-shell" aria-label="Chat with Sparky">
          <div ref={messagesPanelRef} className="sparky-messages" aria-live="polite" aria-relevant="additions text">
            {messages.length === 0 && <div className="sparky-action-shortcuts" aria-label="SafeSpark shortcuts">{SPARKY_APP_ACTIONS.slice(1, 5).map((action) => <button type="button" key={action.path} onClick={() => runAppAction(action)}>{action.label} <span aria-hidden="true">↗</span></button>)}</div>}
            {messages.length === 0 && <div className="sparky-welcome-message"><img src="/assets/brand/sparky-mascot.png" alt="" /><div><strong>Hey{profile?.name ? `, ${profile.name}` : ''}. I’m Sparky.</strong><p>I can help you think through a safer next step. What’s on your mind?</p></div></div>}
            {messages.map((message) => <article className={`sparky-message sparky-message-${message.role}`} key={message.id}><div className="sparky-message-body">{message.role === 'assistant' ? <SparkyMarkdown>{message.content}</SparkyMarkdown> : message.content}</div><div className="sparky-message-meta">{message.role === 'user' ? 'You' : 'Sparky'} · {message.mode === 'voice' ? 'Voice' : 'Text'} · {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(message.timestamp))}</div></article>)}
            {sending && <article className="sparky-message sparky-message-assistant" aria-label="Sparky is responding">{streamingReply ? <div className="sparky-message-body"><SparkyMarkdown>{streamingReply}</SparkyMarkdown><span className="sparky-stream-cursor" aria-hidden="true" /></div> : <div className="sparky-typing-indicator"><span /><span /><span /><span className="visually-hidden">Sparky is thinking</span></div>}<div className="sparky-message-meta">Sparky · responding</div></article>}
          </div>
          {suggestions.length > 0 && <div className="sparky-suggestions" aria-label="Suggested replies"><span>Continue with</span>{suggestions.map((item) => <button type="button" key={item} onClick={() => sendMessage(item)}>{item}</button>)}</div>}
          <form className="sparky-composer" onSubmit={(event) => { event.preventDefault(); sendMessage() }}>
            {completion && !sending && <button className="sparky-completion-hint" type="button" onClick={() => { setDraft((current) => `${current}${/^\s/.test(completion) ? '' : ' '}${completion}`); setCompletion('') }}><Sparkles size={14} aria-hidden="true" /> Add continuation: {completion}</button>}
            <label className="visually-hidden" htmlFor="sparky-message">Message Sparky</label><textarea id="sparky-message" rows="2" maxLength={4000} value={draft} onChange={(event) => { setDraft(event.target.value); setCompletion('') }} placeholder="Write a message…" disabled={sending} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() } }} />
            <div className="sparky-composer-footer"><span>Enter to send · Shift+Enter for a new line</span>{sending ? <button className="sparky-send-button sparky-stop-button" type="button" onClick={stopGeneration}><Square size={16} fill="currentColor" /> Stop</button> : <button className="sparky-send-button" type="submit" disabled={!draft.trim()}><Send size={16} aria-hidden="true" /> Send</button>}</div>
          </form>
          <p className="sparky-safety-footer">Sparky cannot contact emergency services. If you are in immediate danger, call 911.</p>
        </section> : <section className="sparky-voice-panel" aria-label="Voice conversation">
          <div className={`sparky-voice-orb is-${voiceState}${voiceState === 'speaking' ? ' is-amplitude' : ''}`} aria-hidden="true"><span className="sparky-mascot-frame"><img className="sparky-mascot-image" src="/assets/brand/sparky-mascot.png" alt="" /><span className="sparky-mouth" /></span><AudioLines size={18} /></div>
          <p className="sparky-voice-state" role="status" aria-live="polite">{voiceState === 'idle' ? 'Ready when you are' : voiceState.replaceAll('_', ' ')}</p>
          {voiceCaption && <p className="sparky-voice-caption">{voiceCaption}</p>}
          {voiceMessage && <p className={voiceState === 'error' ? 'sparky-error' : 'sparky-inline-status'} role="status">{voiceMessage}</p>}
          {voiceState === 'idle' || voiceState === 'error' ? <button type="button" className="sparky-voice-button" onClick={startVoice}><Mic size={18} /> Start voice conversation</button> : <div className="sparky-voice-controls"><button type="button" className="sparky-secondary-button" onClick={toggleMicrophoneMute}>{microphoneMuted ? <><Mic size={17} /> Unmute</> : <><MicOff size={17} /> Mute</>}</button><button type="button" className="sparky-voice-button sparky-end-voice-button" onClick={endVoice}><X size={17} /> End voice</button></div>}
          {playbackBlocked && <button type="button" className="sparky-secondary-button" onClick={() => audioRef.current?.play().then(() => { setPlaybackBlocked(false); setVoiceMessage('Voice audio enabled.') }).catch(() => {})}><Volume2 size={16} /> Enable voice audio</button>}
          <p className="sparky-privacy-note">Microphone access starts only when you begin voice. Audio is sent to OpenAI Realtime and is not recorded by SafeSpark. GPS stays on this device unless you ask for your current location during voice; then it is shared with Sparky for that answer.</p>
        </section>}

        {emergencyActive && <section className="sparky-emergency-panel" role="alert" aria-live="assertive"><div className="sparky-emergency-heading"><strong>{emergencyIsTest ? 'Safety phrase test' : 'Safety phrase detected'}</strong><span>{emergencyIsTest ? 'Simulation only' : 'Review before taking action'}</span></div><p>{emergencyIsTest ? 'This is only a local test. No call or message has been sent.' : `Safety event recorded on this device at ${emergencyTimestamp ? new Date(emergencyTimestamp).toLocaleTimeString() : 'now'}. No call or message has been sent.`}</p>{currentCoordinates && <p className="sparky-emergency-location">Your location: {currentCoordinates} <a href={`https://maps.google.com/?q=${userPosition.latitude},${userPosition.longitude}`} target="_blank" rel="noreferrer">Open map</a></p>}{!emergencyIsTest && <div className="sparky-emergency-actions"><a href="tel:911" onClick={() => emergencyEventId && updateSafetyEventStatus(profileId, emergencyEventId, 'dialer_opened_unconfirmed')}>Call 911</a>{contacts.map((contact) => <button type="button" key={contact.id} onClick={() => openSmsComposer(contact)}>Text {contact.name}</button>)}</div>}{emergencyMessage && <p role="status">{emergencyMessage}</p>}<button className="sparky-dismiss-emergency" type="button" onClick={() => { if (window.confirm('Dismiss the local safety alert? No alert has been sent.')) { emergencyTriggeredRef.current = true; setEmergencyActive(false) } }}>Dismiss local alert</button></section>}
        {pendingContactAction && <section className="sparky-contact-confirmation" aria-labelledby="sparky-contact-action-title">
          <div><p className="section-kicker">CONFIRM ON YOUR DEVICE</p><h2 id="sparky-contact-action-title">{pendingContactAction.action === 'call' ? `Call ${pendingContactAction.contact.name}?` : `Text ${pendingContactAction.contact.name}?`}</h2><p className="sparky-contact-phone">{pendingContactAction.contact.phone}</p>{pendingContactAction.action === 'text' && <blockquote>{pendingContactAction.message}</blockquote>}<p className="sparky-privacy-note">SafeSpark will open your phone or messaging app. {pendingContactAction.action === 'text' ? 'Review and send the message there; delivery is not confirmed here.' : 'You must complete the call there.'}</p>{contactActionNotice && <p className="sparky-inline-status" role="status">{contactActionNotice}</p>}</div>
          <div className="sparky-contact-confirm-actions">{pendingContactAction.action === 'call' ? <a href={`tel:${pendingContactAction.contact.phone}`} onClick={launchContactAction}><Phone size={16} aria-hidden="true" /> Open phone</a> : <><a href={`sms:${pendingContactAction.contact.phone}?body=${encodeURIComponent(pendingContactAction.message)}`} onClick={launchContactAction}><Send size={16} aria-hidden="true" /> Open Messages</a><button type="button" onClick={copyContactMessage}>Copy message</button></>}<button type="button" onClick={() => { setPendingContactAction(null); setContactActionNotice(''); setVoiceMessage(pendingContactAction.handedOff ? 'Contact action handed off to your device; delivery is unconfirmed.' : 'Contact action cancelled.') }}>{pendingContactAction.handedOff ? 'Done' : 'Cancel'}</button></div>
        </section>}
        {errorMessage && <div className="sparky-error" role="alert">{errorMessage}<button type="button" aria-label="Dismiss error" onClick={() => setErrorMessage('')}><X size={15} /></button></div>}
      </section>
    </main>
    </>
  )
}
