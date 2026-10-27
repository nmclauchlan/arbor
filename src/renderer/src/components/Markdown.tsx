import { Fragment, type ReactNode } from 'react'

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'list'; ordered: boolean; start: number; items: string[][] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'rule' }
  | { kind: 'para'; lines: string[] }

const FENCE = /^\s*(`{3,}|~{3,})/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
const QUOTE = /^\s{0,3}>\s?/
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

const blank = (line: string): boolean => !line.trim()
const indent = (line: string): number => line.length - line.trimStart().length
const startsBlock = (line: string): boolean => FENCE.test(line) || HEADING.test(line) || QUOTE.test(line) || ITEM.test(line) || RULE.test(line)
const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (blank(line)) {
      i++
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++])
      i++
      blocks.push({ kind: 'code', text: body.join('\n') })
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] })
      i++
      continue
    }
    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' })
      i++
      continue
    }
    if (QUOTE.test(line)) {
      const body: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].replace(QUOTE, ''))
      blocks.push({ kind: 'quote', blocks: parseBlocks(body) })
      continue
    }
    const item = ITEM.exec(line)
    if (item) {
      const base = item[1].length
      const ordered = /\d/.test(item[2])
      const items: string[][] = []
      while (i < lines.length) {
        const l = lines[i]
        const m = ITEM.exec(l)
        if (m && m[1].length === base && /\d/.test(m[2]) === ordered) {
          items.push([m[3]])
          i++
        } else if (blank(l)) {
          let j = i + 1
          while (j < lines.length && blank(lines[j])) j++
          const next = j < lines.length ? lines[j] : ''
          const n = ITEM.exec(next)
          if (next && ((n && n[1].length === base && /\d/.test(n[2]) === ordered) || indent(next) > base)) {
            items[items.length - 1].push('')
            i++
          } else break
        } else if (indent(l) > base) {
          items[items.length - 1].push(l.replace(new RegExp(`^ {0,${base + 4}}`), ''))
          i++
        } else if (!startsBlock(l)) {
          items[items.length - 1].push(l.trim())
          i++
        } else break
      }
      blocks.push({ kind: 'list', ordered, start: ordered ? parseInt(item[2], 10) : 1, items })
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = cells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && !blank(lines[i]) && lines[i].includes('|')) rows.push(cells(lines[i++]))
      blocks.push({ kind: 'table', head, rows })
      continue
    }
    const para: string[] = []
    while (i < lines.length && !blank(lines[i]) && (!para.length || !startsBlock(lines[i]))) para.push(lines[i++].trim())
    blocks.push({ kind: 'para', lines: para })
  }
  return blocks
}

const INLINE =
  /\\([\\`*_{}[\]()#+\-.!~>|])|(`+)([\s\S]*?[^`])\2(?!`)|(!?)\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|(https?:\/\/[^\s<>]*[^\s<>().,;:!?'"\]])|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*(?!\s)([^*]+?)\*|(?<![\w])_(?!\s)([^_]+?)_(?![\w])/g

function safeUrl(url: string): string | null {
  return /^(https?:|mailto:)/i.test(url) ? url : null
}

function Link({ href, children }: { href: string; children: ReactNode }): React.JSX.Element {
  return (
    <a href={href} target="_blank" rel="noreferrer" title={href}>
      {children}
    </a>
  )
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    last = at + m[0].length
    const k = key++
    if (m[1] !== undefined) out.push(m[1])
    else if (m[2] !== undefined) out.push(<code key={k}>{m[3].replace(/^ (.*) $/, '$1')}</code>)
    else if (m[5] !== undefined) {
      const href = safeUrl(m[6])
      out.push(href ? <Link key={k} href={href}>{m[4] ? m[5] : inline(m[5])}</Link> : m[0])
    } else if (m[7] !== undefined) out.push(<Link key={k} href={m[7]}>{m[7]}</Link>)
    else if (m[8] !== undefined || m[9] !== undefined) out.push(<strong key={k}>{inline(m[8] ?? m[9])}</strong>)
    else if (m[10] !== undefined) out.push(<del key={k}>{inline(m[10])}</del>)
    else out.push(<em key={k}>{inline(m[11] ?? m[12])}</em>)
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function Lines({ lines }: { lines: string[] }): React.JSX.Element {
  return (
    <>
      {lines.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {inline(l)}
        </Fragment>
      ))}
    </>
  )
}

function ListItem({ lines }: { lines: string[] }): React.JSX.Element {
  const task = /^\[([ xX])\]\s+/.exec(lines[0])
  const body = task ? [lines[0].slice(task[0].length), ...lines.slice(1)] : lines
  const blocks = parseBlocks(body)
  const tight = blocks.length === 1 && blocks[0].kind === 'para'
  return (
    <li className={task ? 'task' : undefined}>
      {task && <input type="checkbox" checked={task[1] !== ' '} disabled readOnly />}
      {tight ? <Lines lines={(blocks[0] as { lines: string[] }).lines} /> : <Blocks blocks={blocks} />}
    </li>
  )
}

function Blocks({ blocks }: { blocks: Block[] }): React.JSX.Element {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading': {
            const H = `h${b.level}` as 'h1'
            return <H key={i}>{inline(b.text)}</H>
          }
          case 'code':
            return <pre key={i}><code>{b.text}</code></pre>
          case 'quote':
            return <blockquote key={i}><Blocks blocks={b.blocks} /></blockquote>
          case 'rule':
            return <hr key={i} />
          case 'table':
            return (
              <div key={i} className="md-table">
                <table>
                  <thead>
                    <tr>{b.head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>{b.head.map((_, k) => <td key={k}>{inline(r[k] ?? '')}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'list': {
            const items = b.items.map((lines, j) => <ListItem key={j} lines={lines} />)
            return b.ordered ? <ol key={i} start={b.start}>{items}</ol> : <ul key={i}>{items}</ul>
          }
          default:
            return <p key={i}><Lines lines={b.lines} /></p>
        }
      })}
    </>
  )
}

export function Markdown({ text, className = '' }: { text: string; className?: string }): React.JSX.Element {
  return (
    <div className={`markdown ${className}`.trim()}>
      <Blocks blocks={parseBlocks(text.replace(/\r\n?/g, '\n').split('\n'))} />
    </div>
  )
}
