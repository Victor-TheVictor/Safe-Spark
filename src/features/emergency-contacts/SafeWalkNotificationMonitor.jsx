import { useEffect } from 'react'
import { SAFE_WALK_KEY } from './contactStore'

function readWalk() {
  try { return JSON.parse(localStorage.getItem(SAFE_WALK_KEY) || 'null') } catch { return null }
}

export default function SafeWalkNotificationMonitor() {
  useEffect(() => {
    const checkTimer = () => {
      const walk = readWalk()
      if (walk?.status !== 'active' || Date.now() < walk.endAt) return
      const due = { ...walk, status: 'due', completedAt: Date.now() }
      localStorage.setItem(SAFE_WALK_KEY, JSON.stringify(due))
      window.dispatchEvent(new Event('safespark-walk-updated'))
      if (localStorage.getItem('safespark-walk-notifications') === 'true' && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Safe Walk check-in', { body: 'Your planned arrival time has passed. Open SafeSpark and check in.' }) } catch { /* The in-app check-in remains visible. */ }
      }
    }
    checkTimer()
    const timer = window.setInterval(checkTimer, 1000)
    return () => window.clearInterval(timer)
  }, [])

  return null
}
