import { useEffect, useMemo, useState } from 'react'
import type { HostAccount, HostRepo } from '@shared/types'
import { errorMessage, formatDate, hostName } from '../util'

const DIR_KEY = 'arbor.cloneDir'
const PROTO_KEY = 'arbor.cloneProtocol'

function loadPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function savePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable */
  }
}

function folderName(url: string): string {
  return url.replace(/\/+$/, '').split(/[/:]/).pop()?.replace(/\.git$/, '') || 'repository'
}

type Source = { kind: 'url' } | { kind: 'account'; account: HostAccount }

export function CloneDialog({
  onClose,
  onCloned,
  onOpenSettings
}: {
  onClose: () => void
  onCloned: (dest: string) => void
  onOpenSettings: () => void
}): React.JSX.Element {
  const [accounts, setAccounts] = useState<HostAccount[] | null>(null)
  const [source, setSource] = useState<Source>({ kind: 'url' })
  const [repos, setRepos] = useState<Record<string, HostRepo[] | string>>({})
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<HostRepo | null>(null)
  const [url, setUrl] = useState('')
  const [protocol, setProtocol] = useState<'https' | 'ssh'>(() => (loadPref(PROTO_KEY, 'https') === 'ssh' ? 'ssh' : 'https'))
  const [parent, setParent] = useState(() => loadPref(DIR_KEY, ''))
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.host
      .accounts()
      .then((list) => {
        setAccounts(list)
        if (list.length) setSource({ kind: 'account', account: list[0] })
      })
      .catch(() => setAccounts([]))
  }, [])

  const accountKey = source.kind === 'account' ? source.account.kind + source.account.baseUrl : ''

  useEffect(() => {
    if (source.kind !== 'account' || repos[accountKey] !== undefined) return
    const { kind, baseUrl } = source.account
    window.host
      .listRepos(kind, baseUrl)
      .then((list) => setRepos((r) => ({ ...r, [accountKey]: list })))
      .catch((e) => setRepos((r) => ({ ...r, [accountKey]: errorMessage(e) })))
  }, [source, accountKey, repos])

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, busy])

  const current = source.kind === 'account' ? repos[accountKey] : undefined
  const filtered = useMemo(() => {
    if (!Array.isArray(current)) return []
    const q = query.trim().toLowerCase()
    return q ? current.filter((r) => r.fullName.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)) : current
  }, [current, query])

  const cloneUrl = source.kind === 'url' ? url.trim() : selected ? (protocol === 'ssh' ? selected.sshUrl : selected.httpsUrl) : ''

  useEffect(() => {
    setName(cloneUrl ? folderName(cloneUrl) : '')
  }, [cloneUrl])

  const dest = parent && name ? `${parent.replace(/[\\/]+$/, '')}/${name}` : ''

  const choose = async (): Promise<void> => {
    const p = await window.git.selectFolder('Choose where to clone into')
    if (p) {
      setParent(p)
      savePref(DIR_KEY, p)
    }
  }

  const clone = async (): Promise<void> => {
    if (!cloneUrl || !dest) return
    setBusy(true)
    setError(null)
    savePref(PROTO_KEY, protocol)
    try {
      if (source.kind === 'account') await window.host.cloneFromHost(source.account.kind, source.account.baseUrl, cloneUrl, dest)
      else await window.git.clone(cloneUrl, dest)
      onCloned(dest)
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={() => !busy && onClose()}>
      <div className="dialog clone-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h3>Clone repository</h3>
          <button className="icon" onClick={onClose} disabled={busy} title="Close (Esc)">✕</button>
        </div>

        <div className="clone-tabs">
          {(accounts ?? []).map((a) => {
            const active = source.kind === 'account' && source.account.kind === a.kind && source.account.baseUrl === a.baseUrl
            return (
              <button
                key={a.kind + a.baseUrl}
                className={active ? 'active' : ''}
                onClick={() => {
                  setSource({ kind: 'account', account: a })
                  setSelected(null)
                  setQuery('')
                }}
              >
                {hostName(a.kind)}
                <small>{a.baseUrl.replace(/^https:\/\//, '')}</small>
              </button>
            )
          })}
          <button className={source.kind === 'url' ? 'active' : ''} onClick={() => setSource({ kind: 'url' })}>
            URL
          </button>
        </div>

        {source.kind === 'url' ? (
          <input
            autoFocus
            value={url}
            spellCheck={false}
            placeholder="https://… or git@…"
            onChange={(e) => setUrl(e.target.value)}
          />
        ) : (
          <>
            <input autoFocus value={query} placeholder="Search repositories" spellCheck={false} onChange={(e) => setQuery(e.target.value)} />
            <div className="clone-list">
              {current === undefined && <div className="clone-empty">Loading repositories…</div>}
              {typeof current === 'string' && <div className="clone-empty error-text">{current}</div>}
              {Array.isArray(current) && filtered.length === 0 && (
                <div className="clone-empty">{query ? `No repositories match “${query}”` : 'No repositories found'}</div>
              )}
              {filtered.map((r) => (
                <div
                  key={r.fullName}
                  className={`clone-row${selected?.fullName === r.fullName ? ' selected' : ''}`}
                  onClick={() => setSelected(r)}
                  onDoubleClick={() => {
                    setSelected(r)
                    if (parent) void clone()
                  }}
                  title={r.httpsUrl}
                >
                  <div className="top">
                    <span className="full">{r.fullName}</span>
                    {r.isPrivate && <span className="lock">private</span>}
                    {r.updatedAt > 0 && <span className="when">{formatDate(r.updatedAt)}</span>}
                  </div>
                  {r.description && <div className="desc">{r.description}</div>}
                </div>
              ))}
            </div>
            <div className="clone-dest">
              <span className="muted">Protocol</span>
              <span className="clone-proto">
                <button className={protocol === 'https' ? 'active' : ''} onClick={() => setProtocol('https')}>HTTPS</button>
                <button className={protocol === 'ssh' ? 'active' : ''} onClick={() => setProtocol('ssh')}>SSH</button>
              </span>
              <span className="muted" style={{ fontSize: 11 }}>
                {protocol === 'https' ? 'Uses your stored token for this clone' : 'Uses your SSH keys'}
              </span>
            </div>
          </>
        )}

        {accounts !== null && accounts.length === 0 && source.kind === 'url' && (
          <div className="muted" style={{ fontSize: 12 }}>
            Connect a GitHub, GitLab or Azure DevOps account to pick from your repositories.{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); onOpenSettings() }}>Open Settings</a>
          </div>
        )}

        <div className="clone-dest">
          <input value={parent} placeholder="Destination folder" spellCheck={false} onChange={(e) => setParent(e.target.value)} />
          <button onClick={() => void choose()} disabled={busy}>Browse…</button>
        </div>
        <div className="clone-dest">
          <span className="muted">Folder name</span>
          <input value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} />
        </div>
        {dest && <div className="muted mono" style={{ fontSize: 11 }}>{dest}</div>}
        {error && <div className="settings-note error">{error}</div>}

        <div className="buttons">
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" aria-busy={busy} disabled={busy || !cloneUrl || !dest} onClick={() => void clone()}>
            {busy ? 'Cloning…' : 'Clone'}
          </button>
        </div>
      </div>
    </div>
  )
}
