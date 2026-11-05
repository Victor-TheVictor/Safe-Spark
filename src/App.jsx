import { useState } from 'react'
import './App.css'
import './Intro.css'
import AuthPage from './pages/AuthPage'
import ProfileHome from './pages/ProfileHome'
import WelcomePage from './pages/WelcomePage'

const PROFILE_KEY = 'safespark-profile'

function readProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY))
  } catch {
    return null
  }
}

function App() {
  const [profile, setProfile] = useState(readProfile)
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState('create')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [countryCode, setCountryCode] = useState('+1')
  const [errors, setErrors] = useState({})

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
    if (!cleanName) nextErrors.name = 'Enter your name to continue.'
    if (digitCount < 7) nextErrors.phone = 'Enter a valid phone number.'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }
    const nextProfile = { name: cleanName, phone: `${countryCode} ${cleanPhone}` }
    localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile))
    setProfile(nextProfile)
    setShowAuth(false)
  }

  function handleLogout() {
    localStorage.removeItem(PROFILE_KEY)
    setProfile(null)
    setName('')
    setPhone('')
    setShowAuth(false)
    setAuthMode('create')
    setErrors({})
  }

  if (profile) return <ProfileHome profile={profile} onLogout={handleLogout} />
  if (!showAuth) return <WelcomePage onGetStarted={() => openAuth('create')} onSignIn={() => openAuth('signin')} />

  return (
    <AuthPage
      mode={authMode}
      onModeChange={(mode) => { setAuthMode(mode); setErrors({}) }}
      onBack={() => { setShowAuth(false); setErrors({}) }}
      onSubmit={handleSubmit}
      name={name}
      setName={(value) => { setName(value); setErrors((current) => ({ ...current, name: '' })) }}
      phone={phone}
      setPhone={(value) => { setPhone(value); setErrors((current) => ({ ...current, phone: '' })) }}
      countryCode={countryCode}
      setCountryCode={setCountryCode}
      errors={errors}
    />
  )
}

export default App
