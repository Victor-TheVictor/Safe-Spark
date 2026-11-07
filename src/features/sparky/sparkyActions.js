import { SPARKY_APP_ACTIONS, getSparkyAppAction } from '../../../shared/sparkyActions.js'

export { SPARKY_APP_ACTIONS, getSparkyAppAction }

// Kept for display-only tests and non-AI shortcuts. User messages are routed by OpenAI tools.
export function resolveSparkyNavigationAction(input) {
  if (typeof input !== 'string') return null
  const phrase = input.toLocaleLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()
  const aliases = [
    ['home', ['home', 'open home', 'go home']],
    ['safety_map', ['map', 'safety map', 'show my location', 'nearest blue light', 'blue light map']],
    ['crime_log', ['crime log', 'open crime log', 'recent incidents']],
    ['safety_gear', ['safety gear', 'open safety gear', 'gear']],
    ['emergency_contacts', ['contacts', 'emergency contacts', 'open contacts']],
    ['profile', ['profile', 'open profile', 'my profile']],
  ]
  const explicitTarget = phrase.replace(/^(please )?(can you )?(open|go to|take me to|show me|navigate to) /, '').replace(/^the /, '').trim()
  const match = aliases.find(([, phrases]) => phrases.includes(phrase) || phrases.includes(explicitTarget))
  return match ? getSparkyAppAction(match[0]) : null
}
