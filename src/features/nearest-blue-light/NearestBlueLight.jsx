import { useState } from 'react'
import { Copy, LocateFixed, MapPin, RefreshCw } from 'lucide-react'
import useNearestBlueLight from './useNearestBlueLight'
import WalkingDirectionsLink from './WalkingDirectionsLink'

function formatDistance(distanceMeters) {
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} m`
  return `${(distanceMeters / 1_000).toFixed(1)} km`
}

function formatUpdatedAt(timestamp) {
  if (!timestamp) return 'Time unavailable'
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp)
}

export default function NearestBlueLight({ onOpenMap }) {
  const { status, nearest, userPosition, currentPlace, placeStatus, error, requestLocation, stopLocationUpdates } = useNearestBlueLight()
  const nearestFacility = nearest?.facilities.find((facility) => facility.description) ?? nearest?.facilities[0]
  const placeName = nearestFacility?.description ||
    (nearestFacility?.name && nearestFacility.name !== 'Emergency Phone' ? nearestFacility.name : 'Blue Light Phone')
  const [locationMessage, setLocationMessage] = useState('')

  async function copyLocationReport() {
    if (!userPosition) return
    try {
      const report = [
        currentPlace ? `Current location: ${currentPlace} (approximate)` : '',
        `GPS accuracy: ${Number.isFinite(userPosition.accuracyMeters) ? `±${Math.max(1, Math.round(userPosition.accuracyMeters))} m` : 'unavailable'}`,
        `Updated: ${formatUpdatedAt(userPosition.capturedAt)}`,
      ].filter(Boolean).join('\n')
      await navigator.clipboard.writeText(report)
      setLocationMessage('Location details copied for your report.')
    } catch {
      setLocationMessage('Copy is unavailable in this browser. Select the location text to copy it.')
    }
  }

  function renderCurrentLocation() {
    if (!userPosition) {
      const message = status === 'loading'
        ? 'Finding your GPS location…'
        : status === 'error'
          ? 'Location is unavailable. Use the retry option below.'
          : 'Allow location access below to identify your nearby place.'
      return <>
        <p className="current-location-empty">{message}</p>
        <p className="current-location-disclosure">
          To show a nearby place name, SafeSpark sends an approximate location point to{' '}
          <a className="current-location-link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>.
        </p>
      </>
    }

    return (
      <>
        <p className={`current-place-name${placeStatus === 'loading' ? ' is-pending' : ''}`}>
          {placeStatus === 'loading'
            ? currentPlace ? `${currentPlace} · updating` : 'Finding nearby place…'
            : currentPlace || 'Nearby place name unavailable'}
        </p>
        {placeStatus === 'error' && !currentPlace && <p className="current-location-status" role="status">The place name service could not identify this location. It will retry after you move.</p>}
        <p className="current-location-meta">
          {Number.isFinite(userPosition.accuracyMeters)
            ? `GPS accuracy ±${Math.max(1, Math.round(userPosition.accuracyMeters))} m`
            : 'GPS accuracy unavailable'}
          {' · '}Updated {formatUpdatedAt(userPosition.capturedAt)}
        </p>
        <div className="current-location-actions">
          <button className="current-location-action" type="button" onClick={copyLocationReport}>
            <Copy size={14} aria-hidden="true" /> Copy location report
          </button>
        </div>
        <p className="current-location-disclosure">
          Place names are approximate. SafeSpark automatically checks the place when you first share location and after meaningful movement. Exact GPS coordinates stay on your device; an approximate point is sent to{' '}
          <a className="current-location-link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>.
        </p>
        {locationMessage && <p className="current-location-status" role="status" aria-live="polite">{locationMessage}</p>}
      </>
    )
  }

  return (
    <>
      <section className="current-location-card" aria-labelledby="current-location-title">
        <div className="current-location-heading">
          <div>
            <p className="section-kicker">GPS reading</p>
            <h3 id="current-location-title">Your current location:</h3>
          </div>
        </div>
        {renderCurrentLocation()}
      </section>

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
    </>
  )
}
