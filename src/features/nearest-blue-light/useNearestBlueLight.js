import { useLocationTracking } from './LocationTrackingContext'

export default function useNearestBlueLight() {
  return useLocationTracking()
}
