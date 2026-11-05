import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { findNearestBlueLight, getUniqueBlueLightLocations, haversineDistanceMeters } from './nearestBlueLight'
import { LocationTrackingContext } from './LocationTrackingContext'

const SESSION_KEY = 'safespark-location-session'
const MIN_UPDATE_INTERVAL_MS = 5_000
const MIN_MOVEMENT_METERS = 12
const MAX_RESTORED_POSITION_AGE_MS = 30_000

function readSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
    const recentPosition = session?.position && Date.now() - session.position.updatedAt <= MAX_RESTORED_POSITION_AGE_MS
      ? session.position
      : null
    return { trackingActive: Boolean(session?.trackingActive), position: recentPosition }
  } catch {
    return { trackingActive: false, position: null }
  }
}

function writeSession(value) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value))
  } catch {
    // Geolocation remains available if session storage is disabled.
  }
}

function locationPolicyBlocked() {
  const policy = document.permissionsPolicy ?? document.featurePolicy
  return policy?.allowsFeature?.('geolocation') === false
}

function errorMessage(error) {
  if (error.code === 1) {
    if (locationPolicyBlocked()) {
      return 'Location is blocked by this preview. Open the app directly in a browser tab, then try again.'
    }
    return `Location is blocked for ${window.location.host}. Allow Location for this site in your browser settings. On Mac, also enable Location Services for your browser. Reload the page, then try again.`
  }
  if (error.code === 2) {
    return 'Your location is unavailable. Check device location services and try again.'
  }
  if (error.code === 3) {
    return 'The location request timed out. Check your connection or location settings and try again.'
  }
  return 'We could not access your location. Check your browser permissions and try again.'
}

export function LocationTrackingProvider({ children }) {
  const [initialSession] = useState(readSession)
  const [features, setFeatures] = useState(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState('')
  const [dataAttempt, setDataAttempt] = useState(0)
  const [trackingActive, setTrackingActive] = useState(() => initialSession.trackingActive)
  const [watchAttempt, setWatchAttempt] = useState(0)
  const [userPosition, setUserPosition] = useState(() => initialSession.position
    ? { latitude: initialSession.position.latitude, longitude: initialSession.position.longitude }
    : null)
  const [locationError, setLocationError] = useState('')
  const lastAcceptedPosition = useRef(initialSession.position
    ? {
      position: { latitude: initialSession.position.latitude, longitude: initialSession.position.longitude },
      timestamp: initialSession.position.updatedAt,
    }
    : null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadFacilities() {
      try {
        const response = await fetch('/emergencyPhones.geojson', { signal: controller.signal })
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
        const collection = await response.json()
        if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
          throw new Error('Invalid Emergency Phone GeoJSON')
        }
        setFeatures(collection.features)
      } catch (error) {
        if (error.name !== 'AbortError') {
          setDataError('Verified Emergency Phone locations could not be loaded. Please try again.')
        }
      } finally {
        if (!controller.signal.aborted) setDataLoading(false)
      }
    }

    loadFacilities()
    return () => controller.abort()
  }, [dataAttempt])

  useEffect(() => {
    if (!trackingActive) return undefined
    if (!navigator.geolocation) return undefined

    let active = true
    let watchId
    const onPosition = (result) => {
      if (!active) return
      const nextPosition = {
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
      }
      if (!Number.isFinite(nextPosition.latitude) || !Number.isFinite(nextPosition.longitude)) return

      const now = Date.now()
      const previous = lastAcceptedPosition.current
      if (previous) {
        const movedMeters = haversineDistanceMeters(previous.position, nextPosition)
        const elapsedMs = now - previous.timestamp
        if (movedMeters < MIN_MOVEMENT_METERS && elapsedMs < MIN_UPDATE_INTERVAL_MS) return
      }

      lastAcceptedPosition.current = { position: nextPosition, timestamp: now }
      setUserPosition(nextPosition)
      setLocationError('')
      writeSession({ trackingActive: true, position: { ...nextPosition, updatedAt: now } })
    }
    const onError = (error) => {
      if (!active) return
      setLocationError(errorMessage(error))
      setUserPosition(null)
      lastAcceptedPosition.current = null
      writeSession({ trackingActive: true, position: null })
    }

    try {
      watchId = navigator.geolocation.watchPosition(onPosition, onError, {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 15_000,
      })
    } catch {
      window.setTimeout(() => {
        if (active) setLocationError('Location access could not be started. Check your browser permissions and try again.')
      }, 0)
    }

    return () => {
      active = false
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
    }
  }, [trackingActive, watchAttempt])

  const locations = useMemo(() => getUniqueBlueLightLocations(features ?? []), [features])
  const nearest = useMemo(
    () => (userPosition ? findNearestBlueLight(locations, userPosition) : null),
    [locations, userPosition],
  )

  const locationUnavailable = trackingActive && !navigator.geolocation
  const status = locationError || dataError || locationUnavailable
    ? 'error'
    : !trackingActive
      ? 'idle'
      : dataLoading || !userPosition
        ? 'loading'
        : nearest
          ? 'ready'
          : 'empty'

  const requestLocation = useCallback(() => {
    if (!window.isSecureContext) {
      setLocationError('Location requires a secure page. Open the app on localhost or an HTTPS address, then try again.')
      return
    }
    if (locationPolicyBlocked()) {
      setLocationError('Location is blocked by this preview. Open the app directly in a browser tab, then try again.')
      return
    }
    if (!navigator.geolocation) {
      setLocationError('Location access is unavailable in this browser. Enable device location services or try another browser.')
      return
    }
    setLocationError('')
    if (dataError || (!features && !dataLoading)) {
      setDataLoading(true)
      setDataAttempt((attempt) => attempt + 1)
    }
    setDataError('')
    setTrackingActive(true)
    setWatchAttempt((attempt) => attempt + 1)
    writeSession({ trackingActive: true, position: lastAcceptedPosition.current
      ? { ...lastAcceptedPosition.current.position, updatedAt: lastAcceptedPosition.current.timestamp }
      : null })
  }, [dataError, dataLoading, features])

  const stopLocationUpdates = useCallback(() => {
    setTrackingActive(false)
    setUserPosition(null)
    setLocationError('')
    lastAcceptedPosition.current = null
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // Ignore storage errors; tracking is stopped in memory regardless.
    }
  }, [])

  const value = useMemo(() => ({
    features: features ?? [],
    locations,
    dataLoading,
    dataError,
    trackingActive,
    userPosition,
    nearest,
    status,
    error: locationError || dataError || (locationUnavailable
      ? 'Location access is unavailable in this browser. Enable device location services or try another browser.'
      : ''),
    requestLocation,
    stopLocationUpdates,
  }), [features, locations, dataLoading, dataError, trackingActive, userPosition, nearest, status, locationError, locationUnavailable, requestLocation, stopLocationUpdates])

  return <LocationTrackingContext.Provider value={value}>{children}</LocationTrackingContext.Provider>
}
