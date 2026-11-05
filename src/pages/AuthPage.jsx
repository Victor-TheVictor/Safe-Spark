import BrandLogo from '../components/BrandLogo'

export default function AuthPage({ mode, onModeChange, onBack, onSubmit, name, setName, phone, setPhone, countryCode, setCountryCode, errors }) {
  const isSignIn = mode === 'signin'

  return (
    <main className="auth-page">
      <section className="auth-form-side">
        <header className="auth-header">
          <button className="back-link" type="button" onClick={onBack}><span aria-hidden="true">←</span> Back</button>
          <BrandLogo className="auth-brand" />
          <span className="header-spacer" aria-hidden="true" />
        </header>

        <div className="auth-content">
          <p className="eyebrow"><span className="eyebrow-mark" /> Your campus companion</p>
          <h1>{isSignIn ? 'Welcome back.' : 'Let’s get you started.'}</h1>
          <p className="auth-description">{isSignIn ? 'Enter your details to continue to SafeSpark.' : 'Add your name and phone number to make SafeSpark yours.'}</p>

          <form className="profile-form" onSubmit={onSubmit} noValidate>
            <div className="form-field">
              <label htmlFor="profile-name">Your name</label>
              <input id="profile-name" name="name" autoComplete="name" placeholder="e.g. Alex Johnson" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} />
              {errors.name && <p className="field-error" id="name-error" role="alert">{errors.name}</p>}
            </div>

            <div className="form-field">
              <label htmlFor="profile-phone">Phone number</label>
              <div className="phone-control">
                <label className="visually-hidden" htmlFor="country-code">Country calling code</label>
                <select id="country-code" value={countryCode} onChange={(event) => setCountryCode(event.target.value)} aria-label="Country calling code">
                  <option value="+1">+1 US / CA</option>
                  <option value="+44">+44 UK</option>
                  <option value="+86">+86 China</option>
                  <option value="+91">+91 India</option>
                  <option value="+61">+61 Australia</option>
                </select>
                <input id="profile-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(812) 555-0123" value={phone} onChange={(event) => setPhone(event.target.value)} required maxLength={24} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'phone-error' : 'profile-note'} />
              </div>
              {errors.phone && <p className="field-error" id="phone-error" role="alert">{errors.phone}</p>}
            </div>

            <button className="primary-action form-submit" type="submit">{isSignIn ? 'Continue' : 'Create my profile'} <span aria-hidden="true">→</span></button>
          </form>

          <p className="profile-note" id="profile-note">Your profile is saved on this device. Phone numbers aren’t verified in this demo.</p>
          <p className="mode-switch">{isSignIn ? 'New to SafeSpark?' : 'Already have a profile?'} <button type="button" onClick={() => onModeChange(isSignIn ? 'create' : 'signin')}>{isSignIn ? 'Get started' : 'Sign in'}</button></p>
        </div>

        <footer className="auth-footer"><span>SAFESPARK</span><a href="tel:911">Emergency? Call 911</a></footer>
      </section>

      <aside className="auth-photo-side" aria-hidden="true">
        <img src="/assets/brand/welcome-campus.jpg" alt="" />
        <div className="photo-message"><span>A little light</span><span>on your way.</span></div>
      </aside>
    </main>
  )
}
