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

export const SPARKY_VOICE_TOOLS = Object.freeze([
  ...SPARKY_REALTIME_TOOLS,
  {
    type: 'function',
    name: 'get_current_location',
    description: 'Use only when the user explicitly asks where they are or asks for the nearest Blue Light Phone. The app returns a human-readable nearby place name and Blue Light distance; never return raw GPS coordinates. Never call proactively or claim a location is known if GPS is unavailable.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
])

export function getSparkyAppAction(screen) {
  return SPARKY_APP_ACTIONS.find((action) => action.screen === screen) || null
}

const ACTION_TERMS = Object.freeze({
  home: ['home', 'homepage', 'dashboard', '主页', '首页'],
  safety_map: ['safety map', 'blue light map', 'map', '地图', '蓝灯地图'],
  crime_log: ['crime log', 'crime report', 'incident log', 'crime', '犯罪记录', '犯罪日志', '犯罪报告'],
  safety_gear: ['safety gear', 'safety equipment', 'gear shop', 'gear', 'shop', '安全装备', '安全用品', '装备'],
  emergency_contacts: ['emergency contacts', 'trusted contacts', 'safety circle', 'contacts', '紧急联系人', '安全圈', '联系人'],
  profile: ['profile', 'account', '个人资料', '账户'],
  sparky_voice: ['sparky voice', 'voice chat', 'voice mode', '语音对话', '语音模式'],
  sparky_chat: ['ai companion', 'sparky chat', 'companion', 'chat', 'ai伙伴', '聊天'],
})

export function resolveSparkyNavigationAction(text) {
  const value = String(text || '').trim().toLocaleLowerCase()
  for (const action of SPARKY_APP_ACTIONS) {
    if ((ACTION_TERMS[action.screen] || []).some((term) => value === term.toLocaleLowerCase())) return action
  }
  const hasNavigationIntent = /\b(?:open|show|go to|take me to|navigate to|bring up|switch to|let me see|view|check|browse|visit|i want to see|i need to get to)\b|(?:打开|查看|带我去|带我到|进入|切换到|我要看|去看看|帮我添加|添加联系人)/i.test(value)
  if (/\b(?:nearest|closest|find)\b.{0,40}\bblue light\b|\bwhere is the nearest blue light\b/i.test(value) || /最近.{0,8}(?:蓝灯|紧急电话)/i.test(value)) return getSparkyAppAction('safety_map')
  if (!hasNavigationIntent) return null
  for (const action of SPARKY_APP_ACTIONS) {
    const terms = ACTION_TERMS[action.screen] || []
    if (terms.some((term) => value.includes(term.toLocaleLowerCase()))) return action
  }
  return null
}
