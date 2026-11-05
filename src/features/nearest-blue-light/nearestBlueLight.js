const EARTH_RADIUS_METERS = 6_371_000

export function haversineDistanceMeters(pointA, pointB) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const latitudeDelta = toRadians(pointB.latitude - pointA.latitude)
  const longitudeDelta = toRadians(pointB.longitude - pointA.longitude)
  const latitudeA = toRadians(pointA.latitude)
  const latitudeB = toRadians(pointB.latitude)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function plainLocationDescription(description = '') {
  const text = String(description)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
  const labeledLocation = text.match(/\bLocation:\s*(.*)$/i)

  return labeledLocation?.[1]?.trim() || text
}

/**
 * Convert official GeoJSON points ([longitude, latitude]) into unique map
 * locations while retaining every distinct source feature and its original ID.
 */
export function getUniqueBlueLightLocations(features = []) {
  const locationsByCoordinate = new Map()

  features.forEach((feature) => {
    const coordinates = feature.geometry?.coordinates
    if (feature.geometry?.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length < 2) return

    const [longitude, latitude] = coordinates
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

    const key = `${longitude},${latitude}`
    const location = locationsByCoordinate.get(key) ?? {
      key,
      latitude,
      longitude,
      coordinates: [longitude, latitude],
      position: [latitude, longitude],
      facilities: [],
    }
    const properties = feature.properties ?? {}
    const id = properties.id ?? feature.id ?? null

    if (!location.facilities.some((facility) => facility.id === id && id !== null)) {
      location.facilities.push({
        id,
        name: properties.name,
        description: plainLocationDescription(properties.description),
      })
    }
    locationsByCoordinate.set(key, location)
  })

  return [...locationsByCoordinate.values()]
}

export function findNearestBlueLight(featuresOrLocations, userPosition) {
  if (!userPosition || !Number.isFinite(userPosition.latitude) || !Number.isFinite(userPosition.longitude)) {
    return null
  }

  const locations = featuresOrLocations?.[0]?.geometry
    ? getUniqueBlueLightLocations(featuresOrLocations)
    : (featuresOrLocations ?? [])

  let nearest = null
  locations.forEach((location) => {
    const distanceMeters = haversineDistanceMeters(userPosition, location)
    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = {
        key: location.key,
        id: location.facilities[0]?.id ?? null,
        latitude: location.latitude,
        longitude: location.longitude,
        coordinates: location.coordinates,
        distanceMeters,
        facilities: location.facilities,
      }
    }
  })

  return nearest
}
