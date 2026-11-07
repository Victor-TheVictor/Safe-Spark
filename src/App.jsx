import { useEffect, useState } from 'react'
import './App.css'
import './Intro.css'
import AuthPage from './pages/AuthPage'
import MapTestPage from './pages/MapTestPage'
import ProfileHome from './pages/ProfileHome'
import WelcomePage from './pages/WelcomePage'
import { LocationTrackingProvider } from './features/nearest-blue-light/LocationTrackingProvider'
import { useLocationTracking } from './features/nearest-blue-light/LocationTrackingContext'
import SparkyCompanion from './features/sparky/SparkyCompanion'
import FeaturePage from './pages/FeaturePage'
import { CONTACTS_KEY, PRIMARY_CONTACT_KEY, SAFE_WALK_KEY } from './features/emergency-contacts/contactStore'
import SafeWalkNotificationMonitor from './features/emergency-contacts/SafeWalkNotificationMonitor'
import { House, UsersRound, ShieldAlert, MapPinned } from 'lucide-react'
import './pages/FeaturePage.css'

const PROFILE_KEY = 'safespark-profile'

function AuthenticatedAppShell({ profile, currentPath, navigateTo, handleLogout, handleForgetProfile }) {
  const { userPosition } = useLocationTracking()
  const knownPaths = ['/', '/map', '/contacts', '/companion', '/sparky/chat', '/sparky/voice', '/crime-log', '/safety-gear', '/profile']
  return (
    <>
      <SafeWalkNotificationMonitor />
      <div className="safe-app-shell">
        <div className="safe-app-screen">
          {currentPath === '/' ? <ProfileHome profile={profile} onLogout={handleLogout} onOpenMap={() => navigateTo('/map')} onNavigate={navigateTo} hideBottomNav /> : null}
          {currentPath === '/map' ? <MapTestPage onBack={() => navigateTo('/')} /> : null}
          {currentPath !== '/' && currentPath !== '/map' && currentPath !== '/companion' && currentPath !== '/sparky/chat' && currentPath !== '/sparky/voice' && knownPaths.includes(currentPath) ? <FeaturePage path={currentPath} profile={profile} onNavigate={navigateTo} onLogout={handleLogout} onForgetProfile={handleForgetProfile} /> : null}
          {!knownPaths.includes(currentPath) ? <main className="feature-page"><h1>Page not found</h1><p>That SafeSpark screen doesn’t exist.</p><button type="button" onClick={() => navigateTo('/')}>Go to Home</button></main> : null}
        </div>
        <nav className="app-bottom-nav" aria-label="Main navigation">
          {[
            { path: '/', label: 'Home', Icon: House },
            { path: '/contacts', label: 'Emergency', Icon: UsersRound },
            { path: '/map', label: 'Map', Icon: MapPinned },
            { path: '/sparky/chat', label: 'AI Companion', image: '/assets/brand/sparky-mascot.png' },
            { path: '/crime-log', label: 'Crime Log', Icon: ShieldAlert },
          ].map(({ path, label, Icon, image }) => (
            <button key={path} type="button" className={currentPath === path || (path === '/sparky/chat' && currentPath === '/sparky/voice') ? 'is-active' : ''} aria-label={label} aria-current={currentPath === path || (path === '/sparky/chat' && currentPath === '/sparky/voice') ? 'page' : undefined} title={label} onClick={() => navigateTo(path)}>
              {image ? <img className="app-nav-mascot" src={image} alt="" aria-hidden="true" /> : <Icon size={21} aria-hidden="true" />}
              <span className="visually-hidden">{label}</span>
            </button>
          ))}
        </nav>
      </div>
      <SparkyCompanion profile={profile} path={currentPath} onNavigate={navigateTo} userPosition={userPosition} />
    </>
  )
}

function readProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY))
    if (!profile || typeof profile !== 'object') return null
    if (typeof profile.id === 'string' && profile.id) return profile
    const migratedProfile = { ...profile, id: globalThis.crypto?.randomUUID?.() || `profile-${Date.now()}-${Math.random().toString(36).slice(2)}` }
    localStorage.setItem(PROFILE_KEY, JSON.stringify(migratedProfile))
    return migratedProfile
  } catch {
    return null
  }
}

function App() {
  const [profile, setProfile] = useState(readProfile)
  const [currentPath, setCurrentPath] = useState(window.location.pathname)
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState('create')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [countryCode, setCountryCode] = useState('+1')
  const [errors, setErrors] = useState({})

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function navigateTo(path) {
    const nextPath = path === '/companion' ? '/sparky/chat' : path
    window.history.pushState({}, '', nextPath)
    setCurrentPath(nextPath)
  }

  function openAuth(mode) {
    setAuthMode(mode)
    setErrors({})
    setShowAuth(true)
  }

  function handleSubmit(event) {
    event.preventDefault()
    const cleanName = name.trim()
    const cleanPhone = phone.trim()
    const digitCount = cleanPhone.replace(/\D/g, '').length
    const nextErrors = {}
    if (digitCount < 7) nextErrors.phone = 'Enter a valid phone number.'
    if (authMode === 'signin') {
      const savedProfile = readProfile()
      const savedDigits = String(savedProfile?.phone ?? '').replace(/\D/g, '')
      const enteredDigits = `${countryCode}${cleanPhone}`.replace(/\D/g, '')
      if (!savedProfile || savedDigits !== enteredDigits) nextErrors.phone = 'No matching local profile. Use the phone number saved on this device or create a new profile.'
      if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }
      setProfile(savedProfile)
      setShowAuth(false)
      return
    }
    if (!cleanName) nextErrors.name = 'Enter your name to continue.'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }
    const nextProfile = {
      id: globalThis.crypto?.randomUUID?.() || `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: cleanName,
      phone: `${countryCode} ${cleanPhone}`,
    }
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile))
    } catch {
      setErrors({ form: 'This browser could not save your profile. Enable local storage and try again.' })
      return
    }
    setProfile(nextProfile)
    setShowAuth(false)
  }

  function handleLogout() {
    try {
      sessionStorage.removeItem('safespark-location-session')
    } catch {
      // Tracking is also cleared when its provider unmounts.
    }
    setProfile(null)
    setName('')
    setPhone('')
    setShowAuth(false)
    setAuthMode('create')
    setErrors({})
  }

  function handleForgetProfile() {
    for (const key of [PROFILE_KEY, CONTACTS_KEY, PRIMARY_CONTACT_KEY, SAFE_WALK_KEY, 'safespark-walk-notifications', 'safespark-preferences']) {
      try { localStorage.removeItem(key) } catch { /* Continue clearing any remaining local records. */ }
    }
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('safespark-sparky-v1:') || key.startsWith('safespark-sparky-events-v1:')) localStorage.removeItem(key)
      }
    } catch { /* Continue account reset even if browser storage cannot be enumerated. */ }
    try { sessionStorage.removeItem('safespark-location-session') } catch { /* Location state resets when provider unmounts. */ }
    setProfile(null)
    setName('')
    setPhone('')
    setShowAuth(false)
    setAuthMode('create')
    setErrors({})
  }

  if (profile) {
    return (
      <LocationTrackingProvider>
        <AuthenticatedAppShell profile={profile} currentPath={currentPath} navigateTo={navigateTo} handleLogout={handleLogout} handleForgetProfile={handleForgetProfile} />
      </LocationTrackingProvider>
    )
  }
  if (!showAuth) return <WelcomePage onGetStarted={() => openAuth('create')} onSignIn={() => openAuth('signin')} />

  return (
    <AuthPage
      mode={authMode}
      onModeChange={(mode) => { setAuthMode(mode); setErrors({}) }}
      onBack={() => { setShowAuth(false); setErrors({}) }}
      onSubmit={handleSubmit}
      name={name}
      setName={(value) => { setName(value); setErrors((current) => ({ ...current, name: '', form: '' })) }}
      phone={phone}
      setPhone={(value) => { setPhone(value); setErrors((current) => ({ ...current, phone: '', form: '' })) }}
      countryCode={countryCode}
      setCountryCode={setCountryCode}
      errors={errors}
    />
  )
}

export default App
