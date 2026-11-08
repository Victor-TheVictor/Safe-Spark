import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { findNearestBlueLight, getUniqueBlueLightLocations, haversineDistanceMeters } from './nearestBlueLight'
import { LocationTrackingContext } from './LocationTrackingContext'

const SESSION_KEY = 'safespark-location-session'
const MIN_UPDATE_INTERVAL_MS = 5_000
const MIN_MOVEMENT_METERS = 12
const MAX_RESTORED_POSITION_AGE_MS = 30_000
const PLACE_LOOKUP_MIN_MOVEMENT_METERS = 100
const PLACE_LOOKUP_MIN_INTERVAL_MS = 60_000

function formatPlaceName(result) {
  const address = result.address ?? {}
  const road = address.road || address.pedestrian || address.footway || address.path
  const street = [address.house_number, road].filter(Boolean).join(' ')
  const locality = address.city || address.town || address.village || address.suburb || address.neighbourhood
  const namedPlace = result.name && result.name !== result.display_name ? result.name : ''
  if (street && locality) return `${street}, ${locality}`
  if (street) return street
  if (namedPlace && locality) return `${namedPlace}, ${locality}`
  return locality || namedPlace || result.display_name || ''
}

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
    ? {
      latitude: initialSession.position.latitude,
      longitude: initialSession.position.longitude,
      accuracyMeters: initialSession.position.accuracyMeters,
      capturedAt: initialSession.position.capturedAt ?? initialSession.position.updatedAt,
    }
    : null)
  const [locationError, setLocationError] = useState('')
  const [currentPlace, setCurrentPlace] = useState('')
  const [placeStatus, setPlaceStatus] = useState('idle')
  const [placeAttempt, setPlaceAttempt] = useState(0)
  const placeLookupRef = useRef({ lastAt: 0, position: null, pendingTimer: null, latestPosition: null, requestId: 0 })
  const lastAcceptedPosition = useRef(initialSession.position
    ? {
      position: {
        latitude: initialSession.position.latitude,
        longitude: initialSession.position.longitude,
        accuracyMeters: initialSession.position.accuracyMeters,
        capturedAt: initialSession.position.capturedAt ?? initialSession.position.updatedAt,
      },
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
        accuracyMeters: result.coords.accuracy,
        capturedAt: result.timestamp || Date.now(),
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
      setCurrentPlace('')
      setPlaceStatus('idle')
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

  useEffect(() => {
    const lookupState = placeLookupRef.current
    if (!userPosition) {
      lookupState.requestId += 1
      if (lookupState.pendingTimer !== null) window.clearTimeout(lookupState.pendingTimer)
      lookupState.pendingTimer = null
      lookupState.latestPosition = null
      return undefined
    }

    lookupState.latestPosition = userPosition
    if (lookupState.position && haversineDistanceMeters(lookupState.position, userPosition) < PLACE_LOOKUP_MIN_MOVEMENT_METERS) return undefined
    lookupState.requestId += 1

    const runLookup = async () => {
      lookupState.pendingTimer = null
      const position = lookupState.latestPosition
      if (!position) return
      const requestId = ++lookupState.requestId
      lookupState.lastAt = Date.now()
      lookupState.position = position
      setPlaceStatus('loading')
      try {
        const query = new URLSearchParams({
          format: 'jsonv2',
          lat: position.latitude.toFixed(5),
          lon: position.longitude.toFixed(5),
          zoom: '18',
          addressdetails: '1',
        })
        // Reverse lookup is cached by location and throttled because the public Nominatim service is community-funded.
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
          headers: { 'Accept-Language': navigator.language || 'en' },
          cache: 'force-cache',
        })
        if (!response.ok) throw new Error(`Place lookup returned ${response.status}`)
        const result = await response.json()
        const label = formatPlaceName(result)
        if (!label) throw new Error('No nearby place name was returned')
        if (requestId !== lookupState.requestId) return
        setCurrentPlace(label)
        setPlaceStatus('ready')
      } catch {
        if (requestId === lookupState.requestId) setPlaceStatus('error')
      }
    }

    const remaining = Math.max(0, PLACE_LOOKUP_MIN_INTERVAL_MS - (Date.now() - lookupState.lastAt))
    if (lookupState.pendingTimer === null) {
      lookupState.pendingTimer = window.setTimeout(runLookup, remaining)
    }
    return undefined
  }, [userPosition, placeAttempt])

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
    if (userPosition) {
      placeLookupRef.current.position = null
      placeLookupRef.current.lastAt = 0
      setPlaceAttempt((attempt) => attempt + 1)
    }
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
  }, [dataError, dataLoading, features, userPosition])

  const stopLocationUpdates = useCallback(() => {
    setTrackingActive(false)
    setUserPosition(null)
    setCurrentPlace('')
    setPlaceStatus('idle')
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
    currentPlace,
    placeStatus,
    status,
    error: locationError || dataError || (locationUnavailable
      ? 'Location access is unavailable in this browser. Enable device location services or try another browser.'
      : ''),
    requestLocation,
    stopLocationUpdates,
  }), [features, locations, dataLoading, dataError, trackingActive, userPosition, nearest, currentPlace, placeStatus, status, locationError, locationUnavailable, requestLocation, stopLocationUpdates])

  return <LocationTrackingContext.Provider value={value}>{children}</LocationTrackingContext.Provider>
}
