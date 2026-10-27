import { useEffect, useMemo, useState } from 'react'
import type { BlameResult } from '@shared/types'
import { Loading } from './Spinner'
import { errorMessage, formatDate, shortHash } from '../util'

const UNCOMMITTED = /^0+$/

export function BlameView({
  repoPath,
  file,
  rev,
  onShowCommit
}: {
  repoPath: string
  file: string
  rev?: string
  onShowCommit: (hash: string) => void
}): React.JSX.Element {
  const [result, setResult] = useState<BlameResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setResult(null)
    setError(null)
    window.git
      .blame(repoPath, file, rev)
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && setError(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [repoPath, file, rev])

  const range = useMemo(() => {
    const times = Object.entries(result?.commits ?? {})
      .filter(([sha]) => !UNCOMMITTED.test(sha))
      .map(([, c]) => c.time)
    return { min: Math.min(...times), max: Math.max(...times) }
  }, [result])

  if (error) return <div className="blame"><div className="placeholder">{error}</div></div>
  if (!result) return <div className="blame"><Loading className="placeholder" /></div>
  if (!result.lines.length) return <div className="blame"><div className="placeholder">This file is empty.</div></div>

  return (
    <div className="blame">
      <table>
        <tbody>
          {result.lines.map((l, i) => {
            const c = result.commits[l.sha]
            const first = i === 0 || result.lines[i - 1].sha !== l.sha
            const uncommitted = UNCOMMITTED.test(l.sha)
            const age = uncommitted || !c || range.max <= range.min ? 1 : (c.time - range.min) / (range.max - range.min)
            return (
              <tr key={i} className={first ? 'blame-start' : undefined} data-sha={l.sha}>
                <td className="blame-age" style={{ opacity: 0.2 + age * 0.8 }} />
                <td
                  className={`blame-info${uncommitted ? '' : ' link'}`}
                  onClick={uncommitted ? undefined : () => onShowCommit(l.sha)}
                  title={c && !uncommitted ? `${c.summary}\n${c.author} · ${new Date(c.time).toLocaleString()} · ${shortHash(l.sha)}\nClick to show it in the graph` : undefined}
                >
                  {first &&
                    (uncommitted ? (
                      <span className="muted">Not committed yet</span>
                    ) : (
                      <>
                        <span className="mono sha">{shortHash(l.sha)}</span>
                        <span className="author">{c?.author}</span>
                        <span className="when">{c ? formatDate(c.time) : ''}</span>
                      </>
                    ))}
                </td>
                <td className="ln">{l.line}</td>
                <td className="code">{l.text}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
