import { useState } from 'react'
import './App.css'
import './Intro.css'

const PROFILE_KEY = 'safespark-profile'

function TorchLogo() {
  return <svg className="torch-logo" viewBox="0 0 64 92" role="img" aria-label="SafeSpark 火炬标志"><path fill="#d64d00" d="M31 3c2 15-14 19-11 35 1 6 5 10 12 11-5-9 4-13 5-22 10 11 14 20 10 30-3 8-10 12-18 11-12-1-20-10-19-21C11 34 27 25 31 3Z"/><path fill="#111111" d="M5 52h51L48 67H14L5 52Zm13 19h25l-3 17H21l-3-17Z"/></svg>
}

function Brand() {
  return <div className="brand"><TorchLogo/><span className="brand-name"><span>safe</span><span>spark</span></span></div>
}

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
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [countryCode, setCountryCode] = useState('+1')

  function handleSubmit(event) {
    event.preventDefault()
    const nextProfile = { name: name.trim(), phone: `${countryCode} ${phone.trim()}` }
    localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile))
    setProfile(nextProfile)
  }

  function handleLogout() {
    localStorage.removeItem(PROFILE_KEY)
    setProfile(null)
  }

  if (profile) {
    return (
      <main className="welcome-screen">
        <header className="topbar"><Brand/><button className="text-button" onClick={handleLogout}>Log out</button></header>
        <section className="welcome-card" id="home">
          <div className="eyebrow"><span className="status-dot" /> YOUR CAMPUS COMPANION</div>
          <h1>Hi, {profile.name}.</h1>
          <p className="welcome-copy">You’re signed in and ready to make your way around campus with a little more peace of mind.</p>
          <div className="home-actions">
            <button className="primary-button" type="button"><span>◎</span> Open campus map <span className="arrow">↗</span></button>
            <button className="secondary-button" type="button"><span>＋</span> Set up a trusted contact</button>
          </div>
          <p className="prototype-note">Your profile is saved on this device. Safety tools are still being set up.</p>
        </section>
        <footer>SAFE SPARK <span>·</span> INDIANA UNIVERSITY BLOOMINGTON</footer>
      </main>
    )
  }

  if (!showAuth) {
    return (
      <main className="intro-screen">
        <header className="intro-header"><Brand/><span className="intro-kicker">SAFE SPARK.</span></header>
        <section className="intro-story">
          <p className="story-question question-one">Ever felt unsafe<br/>walking home alone?</p>
          <p className="story-question question-two">Ever wished someone<br/>knew where you were?</p>
          <h1 className="story-final">A little light on<br/>your way.</h1>
          <div className="light-beam" aria-hidden="true" />
          <div className="torch-stage" aria-hidden="true"><TorchLogo/><span className="torch-glow"/></div>
        </section>
        <section className="intro-bottom">
          <div className="sos-reserved" aria-label="SOS emergency button area"><span className="sos-mark">SOS</span><span><strong>Need help now?</strong><small>Emergency help</small></span><span className="sos-arrow">›</span></div>
          <button className="intro-continue" onClick={() => setShowAuth(true)}>Continue <span>→</span></button>
          <p className="intro-tagline">A little light can make a difference.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="login-screen">
      <section className="form-panel" id="login">
        <div className="mobile-brand"><Brand/></div>
        <form className="login-card" onSubmit={handleSubmit}>
          <h2>Welcome to SafeSpark</h2>
          <p className="form-intro">Enter your details to get started.</p>
          <label htmlFor="name">Your name</label>
          <input id="name" name="name" autoComplete="name" placeholder="e.g. Alex Johnson" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
          <label htmlFor="phone">Phone number</label>
          <div className="phone-entry"><select aria-label="Country calling code" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}><option value="+1">US / Canada +1</option><option value="+44">UK +44</option><option value="+86">China +86</option><option value="+91">India +91</option><option value="+61">Australia +61</option></select><input id="phone" name="phone" type="tel" autoComplete="tel-national" placeholder="(812) 555-0123" value={phone} onChange={(event) => setPhone(event.target.value)} required minLength={7} maxLength={24} /></div>
          <button className="primary-button submit-button" type="submit">Continue</button>
          <p className="privacy-note">Your profile is saved on this device.</p>
        </form>
        <footer>SAFE SPARK <span>·</span> IU BLOOMINGTON</footer>
      </section>
    </main>
  )
}

export default App
