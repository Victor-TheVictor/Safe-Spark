const KNOWLEDGE_UPDATED = '2026-11-07'

export const SPARKY_KNOWLEDGE = Object.freeze([
  {
    id: 'iub-emergency-contacts',
    keywords: ['911', 'police', 'iupd', 'emergency', 'phone number', 'call'],
    content: 'For an immediate emergency in the United States, call 911. IU Bloomington lists IUPD at 812-855-4111 and Safety Escort at 812-855-SAFE (7233). Emergency blue-light phones connect directly to IUPD; use them for emergencies. Verify current contacts at the official IU page.',
    source: 'https://protect.iu.edu/emergency-continuity/emergency-contacts/iub.html',
  },
  {
    id: 'iupd-reporting',
    keywords: ['report', 'crime', 'incident', 'tip', 'police report'],
    content: 'For campus crime reporting and report options, use the official IUPD reporting page. SafeSpark does not submit a police report. In an immediate emergency, call 911.',
    source: 'https://protect.iu.edu/iu-police-department/report/index.html',
  },
  {
    id: 'blue-light-phones',
    keywords: ['blue light', 'emergency phone', 'map', 'nearest phone'],
    content: 'IU emergency phones are also called blue-light phones. Activating one connects to IUPD dispatch. SafeSpark can show its verified campus locations on the Safety Map; its nearest-phone distance is straight-line distance and is not a walking route.',
    source: 'https://protect.iu.edu/iu-police-department/contact/emergency-phone.html',
  },
  {
    id: 'safe-escort',
    keywords: ['escort', 'walk', 'ride', 'safe walk', 'walking alone'],
    content: 'IU Bloomington lists free safe rides for students and employees from 8 p.m. to 1:45 a.m., with a contact number 812-855-SAFE (7233). Hours and service details can change; check the official IUPD page. SafeSpark Safe Walk is a local browser timer and does not dispatch an escort.',
    source: 'https://protect.iu.edu/iu-police-department/iupd-prgrams-services/community-engagement/safe-escort.html',
  },
].map((item) => Object.freeze({ ...item, updatedAt: KNOWLEDGE_UPDATED })))

export function retrieveSparkyKnowledge(query, limit = 3) {
  const normalized = String(query || '').toLocaleLowerCase()
  if (!normalized.trim()) return []
  return SPARKY_KNOWLEDGE
    .map((item) => ({ item, score: item.keywords.reduce((score, keyword) => score + (normalized.includes(keyword) ? Math.max(1, keyword.split(' ').length) : 0), 0) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ item }) => item)
}
