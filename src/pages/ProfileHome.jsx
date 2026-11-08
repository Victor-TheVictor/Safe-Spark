import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Bot,
  ContactRound,
  House,
  LogOut,
  MessageCircle,
  Phone,
  ShoppingCart,
  ShieldAlert,
  UserRound,
} from 'lucide-react'
import BrandLogo from '../components/BrandLogo'
import SafetyMap from '../components/safety-map/SafetyMap'
import { useLocationTracking } from '../features/nearest-blue-light/LocationTrackingContext'
import NearestBlueLight from '../features/nearest-blue-light/NearestBlueLight.jsx'
import { loadContacts, loadPrimaryContactId, phoneForAction } from '../features/emergency-contacts/contactStore'
import './HomePage.css'

const featureCards = [
  {
    title: 'Emergency Contact',
    description: 'Keep the people you trust close at hand.',
    Icon: ContactRound,
    tone: 'orange',
  },
  {
    title: 'AI Companion',
    description: 'Get support from your personal safety companion.',
    Icon: Bot,
    image: '/assets/brand/sparky-mascot.png',
    tone: 'blue',
  },
  {
    title: 'Crime Log',
    description: 'See campus crime and safety information.',
    Icon: ShieldAlert,
    tone: 'plum',
  },
  {
    title: 'Safety Gear',
    description: 'Browse campus safety essentials.',
    Icon: ShoppingCart,
    tone: 'green',
  },
]

const navigationItems = [
  { label: 'Home', Icon: House },
  { label: 'Emergency', Icon: ContactRound },
  { label: 'AI Companion', Icon: Bot },
  { label: 'Crime Log', Icon: ShieldAlert },
]

export default function ProfileHome({ profile, onLogout, onOpenMap, onNavigate, hideBottomNav = false }) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [isHoldingSos, setIsHoldingSos] = useState(false)
  const [sosActionOpen, setSosActionOpen] = useState(false)
  const [sosContacts] = useState(loadContacts)
  const [primaryContactId] = useState(() => loadPrimaryContactId())
  const holdTimerRef = useRef(null)
  const noticeTimerRef = useRef(null)
  const mapPointerRef = useRef(null)
  const { features, dataLoading, dataError, userPosition, nearest } = useLocationTracking()

  useEffect(() => () => {
    window.clearTimeout(holdTimerRef.current)
    window.clearTimeout(noticeTimerRef.current)
  }, [])

  function showNotice(message) {
    window.clearTimeout(noticeTimerRef.current)
    setNotice(message)
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 2400)
  }

  function startSosHold() {
    if (holdTimerRef.current) return
    setIsHoldingSos(true)
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null
      setIsHoldingSos(false)
      setSosActionOpen(true)
    }, 1400)
  }

  function cancelSosHold() {
    window.clearTimeout(holdTimerRef.current)
    holdTimerRef.current = null
    setIsHoldingSos(false)
  }

  function openFullMap() {
    if (onOpenMap) {
      onOpenMap({ focusNearest: false })
      return
    }
    window.location.assign('/map')
  }

  function handleMapClick(event) {
    if (event.target.closest('.leaflet-control, .leaflet-marker-icon, .leaflet-popup')) return
    if (mapPointerRef.current?.moved) {
      mapPointerRef.current = null
      return
    }
    openFullMap()
  }

  function handleMapPointerDown(event) {
    mapPointerRef.current = { x: event.clientX, y: event.clientY, moved: false }
  }

  function handleMapPointerMove(event) {
    if (!mapPointerRef.current) return
    const distance = Math.hypot(
      event.clientX - mapPointerRef.current.x,
      event.clientY - mapPointerRef.current.y,
    )
    if (distance > 8) mapPointerRef.current.moved = true
  }

  function handleSosKeyDown(event) {
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      event.preventDefault()
      startSosHold()
    }
  }

  function handleSosKeyUp(event) {
    if (event.key === 'Enter' || event.key === ' ') cancelSosHold()
  }

  function handleNavigation(label) {
    if (label === 'Home') return
    if (label === 'Emergency') {
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      document.getElementById('sos-section')?.scrollIntoView({ behavior, block: 'center' })
      return
    }
    showNotice(`${label} is not available yet.`)
  }

  const username = typeof profile?.name === 'string' ? profile.name.trim() : ''
  const primaryContact = sosContacts.find((contact) => contact.id === primaryContactId)
  const locationDescription = userPosition
    ? `My current location: https://maps.google.com/?q=${userPosition.latitude},${userPosition.longitude}`
    : 'My current location is unavailable. Please call me.'

  return (
    <main className="home-page">
      <header className="home-header">
        <a className="home-brand" href="/" aria-label="Safe Spark home">
          <BrandLogo className="home-brand-logo" />
        </a>

        <div className="home-heading-copy">
          <p className="home-tagline">A little light on your way.</p>
          <p className="home-greeting">Welcome, <span title={username}>{username || 'there'}</span></p>
        </div>

        <div className="home-account">
          <div className="profile-control">
            <button
              className="avatar-button"
              type="button"
              aria-label="Open personal profile menu"
              aria-expanded={profileMenuOpen}
              aria-controls="profile-menu"
              onClick={() => onNavigate ? onNavigate('/profile') : setProfileMenuOpen((open) => !open)}
            >
              <UserRound size={21} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {profileMenuOpen && (
              <div className="profile-menu" id="profile-menu">
                <span className="profile-menu-name">{username || 'Safe Spark profile'}</span>
                <button className="profile-logout" type="button" onClick={onLogout}>
                  <LogOut size={16} aria-hidden="true" /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="home-content">
        <section className="feature-section" aria-label="Safe Spark features">
          <div className="feature-grid">
        {featureCards.map(({ title, description, Icon, image, tone }) => (
              <button
                className="feature-card"
                key={title}
                type="button"
                onClick={() => {
                  const routes = { 'Emergency Contact': '/contacts', 'AI Companion': '/companion', 'Crime Log': '/crime-log', 'Safety Gear': '/safety-gear' }
                  const route = routes[title]
                  if (route) onNavigate?.(route)
                }}
              >
                <span className={`feature-icon feature-icon-${tone}${image ? ' feature-icon-mascot' : ''}`}>
                  {image
                    ? <img className="feature-mascot" src={image} alt="" aria-hidden="true" />
                    : <Icon size={22} strokeWidth={1.9} aria-hidden="true" />}
                </span>
                <span className="feature-card-copy">
                  <span className="feature-card-title">{title}</span>
                  <span className="feature-card-description">{description}</span>
                </span>
                <ArrowUpRight className="feature-arrow" size={17} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>

        <section className="sos-section" id="sos-section" aria-labelledby="sos-title">
          <h1 className="home-section-title" id="sos-title">Your safety, one touch away</h1>
          <button
            className={`sos-button${isHoldingSos ? ' is-holding' : ''}`}
            type="button"
            aria-label="Press and hold to open emergency call and text options. No alert is sent automatically."
            onPointerDown={startSosHold}
            onPointerUp={cancelSosHold}
            onPointerLeave={cancelSosHold}
            onPointerCancel={cancelSosHold}
            onKeyDown={handleSosKeyDown}
            onKeyUp={handleSosKeyUp}
            onBlur={cancelSosHold}
          >
            <span>{isHoldingSos ? 'HOLD' : 'SOS'}</span>
          </button>
          <p className="sos-instruction">Hold to open call and text options</p>
          <p className="sos-feedback">Nothing is sent automatically.</p>
          {sosActionOpen && (
            <section className="sos-action-panel" role="dialog" aria-labelledby="sos-action-title" aria-modal="false">
              <button className="sos-panel-close" type="button" onClick={() => setSosActionOpen(false)} aria-label="Close emergency options">×</button>
              <h2 id="sos-action-title">Choose how to get help</h2>
              <p>Choose an action. Calls and texts open your phone app; review before sending.</p>
              <a className="sos-panel-call" href="tel:911"><Phone size={18} aria-hidden="true" /> Call 911</a>
              {primaryContact ? (
                <a className="sos-panel-text" href={`sms:${phoneForAction(primaryContact.phone)}?body=${encodeURIComponent(`I need help. ${locationDescription}`)}`}><MessageCircle size={18} aria-hidden="true" /> Text {primaryContact.name}</a>
              ) : (
                <button type="button" className="sos-panel-text" onClick={() => { setSosActionOpen(false); onNavigate?.('/contacts') }}>Add an emergency contact</button>
              )}
              <small>{userPosition ? 'Your current coordinates are included in the prepared text.' : 'Location is unavailable; the prepared text will say so.'} SafeSpark does not send this message.</small>
            </section>
          )}
        </section>

        <section className="blue-light-section" aria-labelledby="blue-light-title">
          <div className="map-section-heading">
            <div>
              <p className="section-kicker">Campus locations</p>
              <h2 className="home-section-title" id="blue-light-title">Blue Light Map</h2>
            </div>
            <a
              className="map-open-link"
              href="/map"
              aria-label="Open the full Blue Light Map"
              onClick={(event) => { event.preventDefault(); openFullMap() }}
            >
              Full map <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
          <div className="blue-light-panel">
            <div
              className="map-preview"
              onClick={handleMapClick}
              onPointerDown={handleMapPointerDown}
              onPointerMove={handleMapPointerMove}
            >
              <SafetyMap
                features={features}
                loading={dataLoading}
                error={dataError}
                userPosition={userPosition}
                nearest={nearest}
              />
            </div>
            <NearestBlueLight onOpenMap={() => onOpenMap?.()} />
          </div>
        </section>
      </div>

      {!hideBottomNav && <nav className="home-bottom-nav" aria-label="Main navigation">
        {navigationItems.map(({ label, Icon }) => (
          <button
            className={`home-nav-item${label === 'Home' ? ' is-active' : ''}`}
            key={label}
            type="button"
            aria-current={label === 'Home' ? 'page' : undefined}
            onClick={() => handleNavigation(label)}
          >
            <Icon size={21} strokeWidth={label === 'Home' ? 2.2 : 1.8} aria-hidden="true" />
            <span className="visually-hidden">{label}</span>
          </button>
        ))}
      </nav>}

      {notice && <div className="home-notice" role="status" aria-live="polite">{notice}</div>}
    </main>
  )
}
