export const SPARKY_APP_ACTIONS = Object.freeze([
  { path: '/', label: 'Home', phrases: ['home', 'open home', 'go home'] },
  { path: '/map', label: 'Safety Map', phrases: ['map', 'safety map', 'show my location', 'nearest blue light', 'blue light map'] },
  { path: '/crime-log', label: 'Crime Log', phrases: ['crime log', 'open crime log', 'recent incidents'] },
  { path: '/safety-gear', label: 'Safety Gear', phrases: ['safety gear', 'open safety gear', 'gear'] },
  { path: '/contacts', label: 'Emergency Contacts', phrases: ['contacts', 'emergency contacts', 'open contacts'] },
  { path: '/profile', label: 'Profile', phrases: ['profile', 'open profile', 'my profile'] },
])

export function resolveSparkyNavigationAction(input) {
  if (typeof input !== 'string') return null
  const phrase = input.toLocaleLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()
  const exact = SPARKY_APP_ACTIONS.find((action) => action.phrases.includes(phrase))
  if (exact) return exact
  const explicitTarget = phrase
    .replace(/^(please )?(can you )?(open|go to|take me to|show me|navigate to) /, '')
    .replace(/^the /, '')
    .trim()
  if (!explicitTarget || explicitTarget === phrase) return null
  return SPARKY_APP_ACTIONS.find((action) => action.phrases.includes(explicitTarget)) || null
}
