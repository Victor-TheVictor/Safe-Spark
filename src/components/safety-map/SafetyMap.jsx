import { memo, useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import {
  LayerGroup,
  LayersControl,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import { getUniqueBlueLightLocations } from '../../features/nearest-blue-light/nearestBlueLight'
import 'leaflet/dist/leaflet.css'
import './SafetyMap.css'

// Verified map baseline: preserve the provider, center, zoom, coordinates, and GeoJSON source.
const IU_CENTER = [39.1688, -86.5230]
const PHONE_MARKER_HTML = '<span class="blue-light-phone-marker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.8c.5-.5 1.3-.5 1.8 0l2 2c.5.5.5 1.2.1 1.7l-1.3 1.7a13.4 13.4 0 0 0 3 3l1.7-1.3c.5-.4 1.2-.4 1.7.1l2 2c.5.5.5 1.3 0 1.8l-1.2 1.2c-.8.8-2 1.1-3.1.7-4.3-1.5-7.7-4.9-9.2-9.2-.4-1.1-.1-2.3.7-3.1z"/></svg></span>'
const blueLightPhoneIcon = L.divIcon({
  className: 'blue-light-phone-icon',
  html: PHONE_MARKER_HTML,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -17],
})
const nearestBlueLightIcon = L.divIcon({
  className: 'blue-light-phone-icon is-nearest-icon',
  html: PHONE_MARKER_HTML.replace('blue-light-phone-marker', 'blue-light-phone-marker is-nearest'),
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -19],
})
const userLocationIcon = L.divIcon({
  className: 'user-location-icon',
  html: '<span class="user-location-pulse"><span class="user-location-dot"></span></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

function getFacilityName(properties = {}) {
  const name = properties.name?.trim()
  return !name || name.toLowerCase() === 'emergency phone' ? 'Blue Light Phone' : name
}

function FollowUserLocation({ userPosition, nearest, focusNearest, initiallyFocused }) {
  const map = useMap()
  const hasFocused = useRef(initiallyFocused)

  useEffect(() => {
    if (userPosition) {
      const center = [userPosition.latitude, userPosition.longitude]
      if (map.getCenter().distanceTo(center) > 1) {
        map.panTo(center, { animate: true, duration: 0.4 })
      }
      return
    }
    if (focusNearest && nearest && !hasFocused.current) {
      hasFocused.current = true
      map.setView([nearest.latitude, nearest.longitude], map.getZoom(), { animate: true })
    }
  }, [userPosition, focusNearest, map, nearest])

  return null
}

function SafetyMapComponent({
  features = [],
  loading = false,
  error = '',
  userPosition = null,
  nearest = null,
  focusNearest = false,
}) {
  const locations = useMemo(() => getUniqueBlueLightLocations(features), [features])
  const nearestKey = nearest?.key ?? null
  const markerElements = useMemo(() => locations.map((location) => (
    <Marker
      key={`${location.key}-${location.key === nearestKey ? 'nearest' : 'phone'}`}
      position={location.position}
      icon={location.key === nearestKey ? nearestBlueLightIcon : blueLightPhoneIcon}
      title={location.key === nearestKey
        ? `Nearest Blue Light · ${location.facilities[0]?.description || getFacilityName(location.facilities[0])}`
        : getFacilityName(location.facilities[0])}
      riseOnHover
    >
      <Popup>
        {location.facilities.map((facility, index) => (
          <div className="blue-light-phone-facility" key={facility.id ?? `${location.key}-${index}`}>
            <strong>{getFacilityName(facility)}</strong>
            {facility.description && <p className="blue-light-phone-description">{facility.description}</p>}
          </div>
        ))}
      </Popup>
    </Marker>
  )), [locations, nearestKey])
  const userPositionCoordinates = useMemo(
    () => (userPosition ? [userPosition.latitude, userPosition.longitude] : null),
    [userPosition],
  )
  const initialCenter = userPositionCoordinates
    ?? (focusNearest && nearest ? [nearest.latitude, nearest.longitude] : IU_CENTER)
  const initiallyFocused = Boolean(focusNearest && nearest)

  return (
    <div className="safety-map-wrapper" data-nearest-blue-light-id={nearest?.id ?? ''}>
      <MapContainer
        center={initialCenter}
        zoom={16}
        zoomSnap={0.25}
        zoomDelta={0.5}
        scrollWheelZoom
        wheelPxPerZoomLevel={80}
        wheelDebounceTime={50}
        zoomAnimation
        fadeAnimation
        markerZoomAnimation
        touchZoom
        inertia
        className="safety-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          updateWhenZooming={false}
          updateWhenIdle
          keepBuffer={2}
        />
        <LayersControl position="topright">
          <LayersControl.Overlay checked name="Blue Light Phones">
            <LayerGroup>{markerElements}</LayerGroup>
          </LayersControl.Overlay>
        </LayersControl>
        {userPositionCoordinates && (
          <Marker position={userPositionCoordinates} icon={userLocationIcon} title="Your current location" zIndexOffset={1000}>
            <Popup>You are here</Popup>
          </Marker>
        )}
        <FollowUserLocation
          userPosition={userPosition}
          nearest={nearest}
          focusNearest={focusNearest}
          initiallyFocused={initiallyFocused}
        />
      </MapContainer>
      {loading && <div className="safety-map-status" role="status">Loading Blue Light Phones…</div>}
      {error && <div className="safety-map-status safety-map-error" role="alert">{error}</div>}
    </div>
  )
}

export default memo(SafetyMapComponent)
