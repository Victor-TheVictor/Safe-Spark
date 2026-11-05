import { createContext, useContext } from 'react'

export const LocationTrackingContext = createContext(null)

export function useLocationTracking() {
  const context = useContext(LocationTrackingContext)
  if (!context) throw new Error('useLocationTracking must be used inside LocationTrackingProvider')
  return context
}
