export const SPARKY_APP_ACTIONS = Object.freeze([
  { screen: 'home', path: '/', label: 'Home' },
  { screen: 'safety_map', path: '/map', label: 'Safety Map' },
  { screen: 'crime_log', path: '/crime-log', label: 'Crime Log' },
  { screen: 'safety_gear', path: '/safety-gear', label: 'Safety Gear' },
  { screen: 'emergency_contacts', path: '/contacts', label: 'Emergency Contacts' },
  { screen: 'profile', path: '/profile', label: 'Profile' },
  { screen: 'sparky_chat', path: '/sparky/chat', label: 'Sparky Text Chat' },
  { screen: 'sparky_voice', path: '/sparky/voice', label: 'Sparky Voice' },
])

export const SPARKY_APP_TOOLS = Object.freeze([
  {
    type: 'function',
    name: 'navigate_to_safe_spark_screen',
    description: 'Open one of the available SafeSpark app screens when the user asks to see, open, or navigate to it. Never use this to claim a safety action has been completed.',
    parameters: {
      type: 'object',
      properties: { screen: { type: 'string', enum: SPARKY_APP_ACTIONS.map((action) => action.screen) } },
      required: ['screen'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: 'function',
    name: 'request_emergency_contact_action',
    description: 'Find a contact saved in this user’s SafeSpark Emergency Contacts and prepare a call or text action. This tool only asks the app to present a confirmation; it never calls or sends a text itself. For text, write a short message that matches the user request. For calls, set message to an empty string. Do not include private conversation history or location unless the user specifically requests it.',
    parameters: {
      type: 'object',
      properties: {
        contact_name: { type: 'string' },
        action: { type: 'string', enum: ['call', 'text'] },
        message: { type: 'string' },
      },
      required: ['contact_name', 'action', 'message'],
      additionalProperties: false,
    },
    strict: true,
  },
])

export const SPARKY_REALTIME_TOOLS = Object.freeze(SPARKY_APP_TOOLS.map((tool) => (
  Object.fromEntries(Object.entries(tool).filter(([key]) => key !== 'strict'))
)))

export function getSparkyAppAction(screen) {
  return SPARKY_APP_ACTIONS.find((action) => action.screen === screen) || null
}
