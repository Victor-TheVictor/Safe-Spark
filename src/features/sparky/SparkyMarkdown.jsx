import { Fragment, createElement } from 'react'

function renderInline(source) {
  const token = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g
  const output = []
  let previous = 0
  let match
  while ((match = token.exec(source))) {
    if (match.index > previous) output.push(source.slice(previous, match.index))
    if (match[2] && match[3]) output.push(createElement('a', { key: match.index, href: match[3], target: '_blank', rel: 'noreferrer' }, match[2]))
    else if (match[4]) output.push(createElement('strong', { key: match.index }, match[4]))
    else if (match[5]) output.push(createElement('code', { key: match.index }, match[5]))
    else if (match[6]) output.push(createElement('em', { key: match.index }, match[6]))
    previous = token.lastIndex
  }
  if (previous < source.length) output.push(source.slice(previous))
  return output.map((item, index) => typeof item === 'string' ? createElement(Fragment, { key: index }, item) : item)
}

export default function SparkyMarkdown({ children }) {
  const lines = String(children || '').split('\n')
  const blocks = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) { index += 1; continue }
    if (line.startsWith('```')) {
      const code = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++])
      index += 1
      blocks.push(createElement('pre', { key: `code-${index}` }, createElement('code', null, code.join('\n'))))
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      blocks.push(createElement(`h${heading[1].length + 1}`, { key: `heading-${index}` }, renderInline(heading[2])))
      index += 1
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) items.push(createElement('li', { key: index }, renderInline(lines[index++].replace(/^\s*[-*]\s+/, ''))))
      blocks.push(createElement('ul', { key: `list-${index}` }, items))
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) items.push(createElement('li', { key: index }, renderInline(lines[index++].replace(/^\s*\d+\.\s+/, ''))))
      blocks.push(createElement('ol', { key: `list-${index}` }, items))
      continue
    }
    const paragraph = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s|^```|^\s*[-*]\s+|^\s*\d+\.\s+/.test(lines[index])) paragraph.push(lines[index++])
    blocks.push(createElement('p', { key: `paragraph-${index}` }, renderInline(paragraph.join(' '))))
  }
  return <div className="sparky-markdown">{blocks}</div>
}
