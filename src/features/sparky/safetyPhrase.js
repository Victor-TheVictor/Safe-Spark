export function transcriptMatchesSafetyPhrase(transcript, phrase) {
  const normalize = (value) => typeof value === 'string'
    ? value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    : ''
  const text = normalize(transcript)
  const target = normalize(phrase)
  return Boolean(target && ` ${text} `.includes(` ${target} `))
}
