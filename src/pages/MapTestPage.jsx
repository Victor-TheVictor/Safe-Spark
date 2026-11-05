import SafetyMap from '../components/safety-map/SafetyMap'
import { useLocationTracking } from '../features/nearest-blue-light/LocationTrackingContext'
import WalkingDirectionsLink from '../features/nearest-blue-light/WalkingDirectionsLink'
import './MapTestPage.css'

export default function MapTestPage({ focusNearest = false, onBack }) {
  const {
    features,
    dataLoading,
    dataError,
    trackingActive,
    userPosition,
    nearest,
    status,
    error,
    requestLocation,
  } = useLocationTracking()
  const nearestPlaceName = nearest?.facilities.find((facility) => facility.description)?.description
    || nearest?.facilities.find((facility) => facility.name && facility.name !== 'Emergency Phone')?.name
    || 'Blue Light Phone'

  return (
    <main className="map-page">
      <div className="map-page-header">
        <button type="button" onClick={onBack}>← Home</button>
        <h1>IU Campus Safety Map</h1>
        {(!trackingActive || status === 'error') ? (
          <button className="map-location-button" type="button" onClick={requestLocation}>
            {trackingActive ? 'Try again' : 'Use my location'}
          </button>
        ) : <span className="map-location-status">{userPosition ? 'Following your location' : 'Waiting for location'}</span>}
      </div>
      {nearest && userPosition && (
        <div className="map-directions-panel">
          <div>
            <strong>Nearest Blue Light</strong>
            <span>{nearestPlaceName}</span>
          </div>
          <WalkingDirectionsLink
            className="map-directions-link"
            origin={userPosition}
            destination={nearest}
          />
        </div>
      )}
      {status === 'loading' && <p className="map-location-message" role="status">Finding your location and nearest Blue Light Phone…</p>}
      {status === 'error' && <p className="map-location-message is-error" role="alert">{error}</p>}
      <div className="map-page-canvas">
        <SafetyMap
          features={features}
          loading={dataLoading}
          error={dataError}
          userPosition={userPosition}
          nearest={nearest}
          focusNearest={focusNearest}
        />
      </div>
    </main>
  )
}
