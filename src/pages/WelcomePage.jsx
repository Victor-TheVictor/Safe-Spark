import BrandLogo from '../components/BrandLogo'

export default function WelcomePage({ onGetStarted, onSignIn }) {
  return (
    <main className="welcome-page">
      <header className="welcome-header">
        <BrandLogo className="welcome-brand" />
        <div className="header-actions">
          <span className="campus-label">IU Bloomington</span>
          <button className="header-signin" type="button" onClick={onSignIn}>Sign in</button>
        </div>
      </header>

      <section className="welcome-hero" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <p className="eyebrow"><span className="eyebrow-mark" /> A little more peace of mind</p>
          <h1 id="welcome-title">Feel more at ease on your way home.</h1>
          <p className="welcome-description">A campus safety companion for the walks, routes, and people that make up your day.</p>
        </div>

        <div className="welcome-photo-wrap">
          <img className="welcome-photo" src="/assets/brand/welcome-campus.jpg" alt="A student walking along a tree-lined campus path in the afternoon" />
        </div>

        <div className="welcome-actions">
          <button className="primary-action" type="button" onClick={onGetStarted}>Get started <span aria-hidden="true">→</span></button>
          <p className="welcome-already">Already have a profile? <button type="button" onClick={onSignIn}>Sign in</button></p>
          <a className="emergency-link" href="tel:911"><span className="emergency-symbol" aria-hidden="true">!</span> Need urgent help? Call 911</a>
        </div>
      </section>

      <footer className="welcome-footer"><span>SAFESPARK</span><span>Made for getting around campus</span></footer>
    </main>
  )
}
