import { useEffect, useMemo, useState } from 'react'
import { MapPin, MessageCircle, Phone, UserRoundPlus } from 'lucide-react'
import { useLocationTracking } from '../nearest-blue-light/LocationTrackingContext'
import { SAFE_WALK_KEY, loadContacts, loadPrimaryContactId, phoneForAction, saveContacts, savePrimaryContactId } from './contactStore'

function readWalk() {
  try {
    const walk = JSON.parse(localStorage.getItem(SAFE_WALK_KEY) || 'null')
    return walk && Number.isFinite(walk.endAt) ? walk : null
  } catch {
    return null
  }
}

function formatTime(seconds) {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  const remainder = Math.max(0, seconds) % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

export default function EmergencyContactsSection({ onNavigate }) {
  const [contacts, setContacts] = useState(loadContacts)
  const [primaryId, setPrimaryId] = useState(() => loadPrimaryContactId())
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [messageEditorId, setMessageEditorId] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [emergencyDraft, setEmergencyDraft] = useState('')
  const [emergencyComposerOpen, setEmergencyComposerOpen] = useState(false)
  const [eta, setEta] = useState('20')
  const [walk, setWalk] = useState(readWalk)
  const [now, setNow] = useState(0)
  const [notice, setNotice] = useState('')
  const { userPosition, currentPlace, placeStatus, requestLocation } = useLocationTracking()
  const primary = useMemo(() => contacts.find((contact) => contact.id === primaryId), [contacts, primaryId])

  function commitContacts(next) {
    setContacts(next)
    saveContacts(next)
    if (!next.some((contact) => contact.id === primaryId)) {
      const nextPrimaryId = next[0]?.id ?? ''
      setPrimaryId(nextPrimaryId)
      savePrimaryContactId(nextPrimaryId)
    }
  }

  function commitWalk(next) {
    setWalk(next)
    if (next) localStorage.setItem(SAFE_WALK_KEY, JSON.stringify(next))
    else localStorage.removeItem(SAFE_WALK_KEY)
    window.dispatchEvent(new Event('safespark-walk-updated'))
  }

  useEffect(() => {
    const update = () => { setNow(Date.now()); setWalk(readWalk()) }
    update()
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    window.addEventListener('safespark-walk-updated', update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('safespark-walk-updated', update)
    }
  }, [])

  function addContact(event) {
    event.preventDefault()
    const cleanName = name.trim()
    const cleanPhone = phone.trim()
    if (!cleanName || phoneForAction(cleanPhone).replace(/\D/g, '').length < 7) {
      setNotice('Enter a name and a valid phone number.')
      return
    }
    const contact = { id: globalThis.crypto?.randomUUID?.() ?? `contact-${Date.now()}`, name: cleanName, phone: cleanPhone }
    const next = [...contacts, contact]
    setContacts(next)
    saveContacts(next)
    if (!primaryId) {
      setPrimaryId(contact.id)
      savePrimaryContactId(contact.id)
    }
    setName('')
    setPhone('')
    setNotice(`${contact.name} added to your device.`)
  }

  function startEdit(contact) {
    setEditingId(contact.id)
    setEditName(contact.name)
    setEditPhone(contact.phone)
  }

  function saveEdit(event, contact) {
    event.preventDefault()
    const cleanName = editName.trim()
    const cleanPhone = editPhone.trim()
    if (!cleanName || phoneForAction(cleanPhone).replace(/\D/g, '').length < 7) {
      setNotice('Enter a name and a valid phone number.')
      return
    }
    commitContacts(contacts.map((item) => item.id === contact.id ? { ...item, name: cleanName, phone: cleanPhone } : item))
    setEditingId('')
    setNotice('Contact updated.')
  }

  function createSmsLink(contact, message) {
    return `sms:${phoneForAction(contact.phone)}?body=${encodeURIComponent(message)}`
  }

  function beginMessageEdit(contact) {
    setMessageEditorId(contact.id)
    setMessageDraft(contact.smsMessage || `Hi ${contact.name}, checking in with you from SafeSpark.`)
  }

  function saveMessageTemplate(event, contact) {
    event.preventDefault()
    const message = messageDraft.trim()
    if (!message) {
      setNotice('Enter a message before saving it.')
      return
    }
    commitContacts(contacts.map((item) => item.id === contact.id ? { ...item, smsMessage: message } : item))
    setMessageEditorId('')
    setNotice(`Text template saved for ${contact.name}.`)
  }

  function openEmergencyComposer() {
    if (!userPosition) requestLocation()
    const place = currentPlace && placeStatus === 'ready' ? currentPlace : ''
    const locationSentence = place
      ? `My current location is near ${place}.`
      : 'My location is not included in this text. Please call me.'
    setEmergencyDraft(`I need help. ${locationSentence}`)
    setEmergencyComposerOpen(true)
  }

  const savedTemplate = (contact) => contact.smsMessage || `Hi ${contact.name}, checking in with you from SafeSpark.`
  const secondsLeft = walk?.status === 'active' ? Math.ceil((walk.endAt - now) / 1000) : 0

  return (
    <section className="contacts-feature" aria-labelledby="circle-title">
      <h2 id="circle-title">My Safety Circle</h2>
      <p>Choose someone you trust. Contacts are stored on this device; SafeSpark does not send messages automatically.</p>
      <form className="contact-add-form" onSubmit={addContact}>
        <label>Name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} /></label>
        <label>Phone number<input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1 812 555 0123" required maxLength={24} /></label>
        <button type="submit"><UserRoundPlus size={17} aria-hidden="true" /> Add contact</button>
      </form>
      {notice && <p className="contacts-notice" role="status">{notice}</p>}

      <h2>Trusted contacts</h2>
      {!contacts.length && <p className="feature-note">No contacts added yet. Add someone you trust to prepare a call or text.</p>}
      {contacts.map((contact) => (
        <article className="contact-item" key={contact.id}>
          {editingId === contact.id ? (
            <form className="contact-edit-form" onSubmit={(event) => saveEdit(event, contact)}>
              <label>Name<input value={editName} onChange={(event) => setEditName(event.target.value)} required maxLength={80} /></label>
              <label>Phone number<input type="tel" inputMode="tel" value={editPhone} onChange={(event) => setEditPhone(event.target.value)} required maxLength={24} /></label>
              <div><button type="submit">Save contact</button><button type="button" onClick={() => setEditingId('')}>Cancel</button></div>
            </form>
          ) : (
            <>
              <label className="contact-primary-choice"><input type="radio" name="primary-contact" checked={primaryId === contact.id} onChange={() => { setPrimaryId(contact.id); savePrimaryContactId(contact.id) }} /><span><strong>{contact.name}</strong><small>{contact.phone}{primaryId === contact.id ? ' · Primary' : ''}</small></span></label>
              <div className="contact-actions">
                <a href={`tel:${phoneForAction(contact.phone)}`}><Phone size={15} aria-hidden="true" /> Call</a>
                <a href={createSmsLink(contact, savedTemplate(contact))}><MessageCircle size={15} aria-hidden="true" /> Text</a>
                <button type="button" onClick={() => beginMessageEdit(contact)}>Edit text</button>
                <button type="button" onClick={() => startEdit(contact)}>Edit</button>
                <button type="button" onClick={() => { if (window.confirm(`Remove ${contact.name} from your Safety Circle?`)) commitContacts(contacts.filter((item) => item.id !== contact.id)) }}>Remove</button>
              </div>
              {messageEditorId === contact.id && <form className="contact-message-editor" onSubmit={(event) => saveMessageTemplate(event, contact)}>
                <label>Saved text for {contact.name}<textarea value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} maxLength={500} rows={3} required /></label>
                <small>{messageDraft.length}/500 · You can review or change it again in Messages before sending.</small>
                <div><button type="submit">Save text</button><button type="button" onClick={() => setMessageEditorId('')}>Cancel</button></div>
              </form>}
            </>
          )}
        </article>
      ))}

      <section className="emergency-options" aria-labelledby="emergency-options-title">
        <h2 id="emergency-options-title">Emergency options</h2>
        <a className="feature-primary emergency-call-link" href="tel:911"><Phone size={17} aria-hidden="true" /> Call 911</a>
        {primary ? (
          <>
            <button className="prepare-help-link" type="button" onClick={openEmergencyComposer}><MessageCircle size={17} aria-hidden="true" /> Prepare help text to {primary.name}</button>
            {emergencyComposerOpen && <div className="emergency-message-composer">
              <label>Message to {primary.name}<textarea value={emergencyDraft} onChange={(event) => setEmergencyDraft(event.target.value)} maxLength={500} rows={4} /></label>
              <p>{currentPlace && placeStatus === 'ready' ? `Location included: ${currentPlace}` : 'Nearby place name is not available yet; edit the message to add a landmark or address you recognize.'}</p>
              {currentPlace && placeStatus === 'ready' && !emergencyDraft.includes(currentPlace) && <button type="button" onClick={() => setEmergencyDraft((message) => `${message.trim()} My current location is near ${currentPlace}.`.trim())}>Add current place to text</button>}
              <div><a className="prepare-help-link" href={emergencyDraft.trim() ? createSmsLink(primary, emergencyDraft.trim()) : undefined} onClick={(event) => { if (!emergencyDraft.trim()) event.preventDefault(); else setEmergencyComposerOpen(false) }}><MessageCircle size={16} aria-hidden="true" /> Open in Messages</a><button type="button" onClick={() => setEmergencyComposerOpen(false)}>Cancel</button></div>
            </div>}
          </>
        ) : <p>Add a trusted contact to prepare a help text.</p>}
        <p className="feature-note">Calls and texts open your phone app. Review and send the message yourself; SafeSpark does not contact emergency services or your contacts in the background.</p>
      </section>

      <section className="safe-walk-section" aria-labelledby="safe-walk-title">
        <div className="safe-walk-heading"><div><p className="section-kicker">Check-in timer</p><h2 id="safe-walk-title">Safe Walk</h2></div><button type="button" onClick={() => onNavigate('/map')}><MapPin size={16} aria-hidden="true" /> Open map</button></div>
        {walk?.status === 'active' ? (
          <div className="safe-walk-active" role="status" aria-live="polite"><strong>{formatTime(secondsLeft)}</strong><span>Remaining · keep this tab open for the reminder</span><button type="button" onClick={() => commitWalk({ ...walk, status: 'checked-in', completedAt: Date.now() })}>I’m safe</button><button type="button" onClick={() => commitWalk(null)}>End check-in</button></div>
        ) : walk?.status === 'due' ? (
          <div className="safe-walk-active" role="status"><strong>Check in</strong><span>Your planned arrival time has passed. Are you safe?</span><button type="button" onClick={() => commitWalk({ ...walk, status: 'checked-in' })}>I’m safe</button><button type="button" onClick={() => { const startedAt = Date.now(); const duration = 10 * 60; const next = { ...walk, startedAt, endAt: startedAt + duration * 1000, durationSeconds: duration, status: 'active' }; commitWalk(next) }}>Add 10 minutes</button></div>
        ) : walk?.status === 'checked-in' ? (
          <div className="safe-walk-active" role="status"><strong>Checked in</strong><span>Glad you made it safely.</span><button type="button" onClick={() => commitWalk(null)}>Done</button></div>
        ) : (
          <div className="safe-walk-setup"><label>Arrival in (minutes)<input type="number" min="5" max="180" step="5" value={eta} onChange={(event) => setEta(event.target.value)} /></label><button type="button" disabled={!contacts.length} onClick={() => { const startedAt = Date.now(); const duration = Number(eta) * 60; commitWalk({ startedAt, endAt: startedAt + duration * 1000, durationSeconds: duration, contactId: primaryId, status: 'active' }) }}>Start check-in</button>{!contacts.length && <small>Add a contact before starting.</small>}</div>
        )}
        <p className="feature-note">This timer reminds you in this browser while the app remains open. It does not share your location or alert another person.</p>
      </section>
    </section>
  )
}
