import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'

const DATA_URL = 'https://data.bloomington.in.gov/resource/t5xf-ggw6.json'
const SOURCE_URL = 'https://data.bloomington.in.gov/d/t5xf-ggw6'

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export default function BloomingtonCalls() {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshedAt, setRefreshedAt] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function loadCalls() {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({
          '$select': 'case_number,datetime,nature,district,agency,report',
          '$order': 'datetime DESC',
          '$limit': '12',
        })
        const response = await fetch(`${DATA_URL}?${params.toString()}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`City data returned ${response.status}`)
        const data = await response.json()
        if (!Array.isArray(data)) throw new Error('Unexpected city data format')
        setCalls(data.filter((row) => row.datetime && row.nature))
        setRefreshedAt(new Date())
      } catch (fetchError) {
        if (fetchError.name !== 'AbortError') setError('Bloomington’s live feed could not be loaded. Use the official city data page to view current records.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    loadCalls()
    return () => controller.abort()
  }, [attempt])

  return (
    <section className="bloomington-calls" aria-labelledby="bloomington-calls-title">
      <div className="crime-source-heading">
        <div><p className="section-kicker">City of Bloomington · live public dataset</p><h2 id="bloomington-calls-title">Calls for Service</h2></div>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} disabled={loading} aria-label="Refresh Bloomington calls"><RefreshCw size={16} aria-hidden="true" /> Refresh</button>
      </div>
      <p className="feature-note">Police calls for service include non-crime activity and are not verified crime reports. City records are kept separate from IU campus reports. The live feed includes only call type, time, agency, district, and report status; it omits personal details and street addresses.</p>
      {loading && <p role="status">Loading the latest city records…</p>}
      {error && <div className="city-feed-error" role="status"><p>{error}</p><a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">Open Bloomington Open Data <ExternalLink size={14} aria-hidden="true" /></a></div>}
      {!loading && !error && calls.length === 0 && <p>No recent city calls were returned by the feed.</p>}
      {!error && calls.map((call) => (
        <article className="city-call-row" key={`${call.case_number}-${call.datetime}`}>
          <div><strong>{call.nature}</strong><span>{formatDate(call.datetime)}</span></div>
          <small>{call.agency || 'Agency not listed'}{call.district ? ` · District ${call.district}` : ''} · {call.report || 'Report status unavailable'}</small>
        </article>
      ))}
      <div className="city-feed-footer"><span>{refreshedAt ? `Retrieved ${refreshedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Source: City of Bloomington Police Department'}</span><a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">Source data <ExternalLink size={13} aria-hidden="true" /></a></div>
    </section>
  )
}
