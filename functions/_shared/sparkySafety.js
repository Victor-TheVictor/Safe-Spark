const IMMEDIATE_RISK_PATTERNS = [
  /i(?:'m| am) in immediate danger/i,
  /someone (?:is )?(?:following|chasing|attacking) me/i,
  /i(?:'m| am) being (?:followed|attacked|threatened)/i,
  /i need help right now/i,
  /someone is unconscious/i,
  /i can't breathe/i,
]

export function classifySparkySafetyIntent(text) {
  if (typeof text !== 'string') return 'general'
  return IMMEDIATE_RISK_PATTERNS.some((pattern) => pattern.test(text)) ? 'immediate-risk' : 'general'
}
