import { Navigation } from 'lucide-react'

function googleWalkingDirectionsUrl(origin, destination) {
  if (!origin || !destination) return ''
  const originValue = `${origin.latitude},${origin.longitude}`
  const destinationValue = `${destination.latitude},${destination.longitude}`
  const params = new URLSearchParams({
    api: '1',
    origin: originValue,
    destination: destinationValue,
    travelmode: 'walking',
    dir_action: 'navigate',
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export default function WalkingDirectionsLink({ origin, destination, className = '' }) {
  const href = googleWalkingDirectionsUrl(origin, destination)
  if (!href) return null

  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Start walking directions to the nearest Blue Light Phone in Google Maps"
    >
      <Navigation size={16} aria-hidden="true" />
      <span>Navigate</span>
    </a>
  )
}
