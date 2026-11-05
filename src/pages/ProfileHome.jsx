import BrandLogo from '../components/BrandLogo'

export default function ProfileHome({ profile, onLogout }) {
  return (
    <main className="profile-home">
      <header className="profile-header"><BrandLogo className="profile-brand" /><button className="text-button" type="button" onClick={onLogout}>Log out</button></header>
      <section className="profile-welcome">
        <p className="eyebrow"><span className="eyebrow-mark" /> Your campus companion</p>
        <h1>Hi, {profile.name}.</h1>
        <p className="profile-copy">You’re signed in and ready to make your way around campus with a little more peace of mind.</p>
        <div className="profile-actions">
          <button className="primary-action" type="button">Open campus map <span aria-hidden="true">→</span></button>
          <button className="secondary-action" type="button">Set up a trusted contact</button>
        </div>
        <p className="profile-note">Your profile is saved on this device. Safety tools are still being set up.</p>
      </section>
      <footer className="welcome-footer"><span>SAFESPARK</span><span>Made for getting around campus</span></footer>
    </main>
  )
}
