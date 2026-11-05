import { LocateFixed, MapPin, RefreshCw } from 'lucide-react'
import useNearestBlueLight from './useNearestBlueLight'
import WalkingDirectionsLink from './WalkingDirectionsLink'

function formatDistance(distanceMeters) {
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} m`
  return `${(distanceMeters / 1_000).toFixed(1)} km`
}

export default function NearestBlueLight({ onOpenMap }) {
  const { status, nearest, userPosition, error, requestLocation, stopLocationUpdates } = useNearestBlueLight()
  const nearestFacility = nearest?.facilities.find((facility) => facility.description) ?? nearest?.facilities[0]
  const placeName = nearestFacility?.description ||
    (nearestFacility?.name && nearestFacility.name !== 'Emergency Phone' ? nearestFacility.name : 'Blue Light Phone')

  return (
    <section className="nearest-section" aria-labelledby="nearest-title">
      <div className="nearest-heading-row">
        <div>
          <p className="section-kicker">Using your current location</p>
          <h2 className="home-section-title" id="nearest-title">Nearest Blue Light</h2>
        </div>
        {status === 'ready' && (
          <button className="location-refresh" type="button" onClick={requestLocation} aria-label="Refresh current location">
            <RefreshCw size={17} aria-hidden="true" />
          </button>
        )}
      </div>

      {status === 'idle' && (
        <div className="nearest-state nearest-idle">
          <p>Allow location access to find the closest Emergency Phone.</p>
          <button className="location-action" type="button" onClick={requestLocation}>
            <LocateFixed size={18} aria-hidden="true" /> Use my location
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="nearest-state" role="status" aria-live="polite">
          <span className="location-loader" aria-hidden="true" />
          <p>Finding the nearest Emergency Phone…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="nearest-state nearest-error" role="alert">
          <p>{error}</p>
          <button className="location-action location-action-secondary" type="button" onClick={requestLocation}>
            <RefreshCw size={16} aria-hidden="true" /> Try again
          </button>
        </div>
      )}

      {status === 'empty' && (
        <div className="nearest-state nearest-error" role="status">
          <p>No valid Emergency Phone locations were found in the verified map data.</p>
          <button className="location-action location-action-secondary" type="button" onClick={requestLocation}>Try again</button>
        </div>
      )}

      {status === 'ready' && nearest && (
        <div className="nearest-result" aria-live="polite">
          <div className="nearest-result-topline">
            <span className="nearest-live-indicator"><span /> Current location</span>
            <span className="nearest-distance">{formatDistance(nearest.distanceMeters)}</span>
          </div>
          <div className="nearest-facilities">
            <article className="nearest-facility">
              <h3>{placeName}</h3>
            </article>
          </div>
          <div className="nearest-result-footer">
            <span>Straight-line distance · not a walking route</span>
            <div className="nearest-actions">
              <button className="nearest-map-button" type="button" onClick={() => onOpenMap?.(nearest)} aria-label="Show nearest Blue Light on map">
                <MapPin size={15} aria-hidden="true" /> Map
              </button>
              <WalkingDirectionsLink
                className="nearest-directions-link"
                origin={userPosition}
                destination={nearest}
              />
              <button className="stop-location-button" type="button" onClick={stopLocationUpdates}>Stop updates</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
