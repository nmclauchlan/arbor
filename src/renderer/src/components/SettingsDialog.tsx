import { useCallback, useEffect, useState } from 'react'
import type { HostAccount } from '@shared/types'
import { setFileView, useFileView } from '../fileView'
import { SETTINGS_DEFAULTS, SETTINGS_LIMITS, setSettings, useSettings } from '../settings'
import { setTheme, THEMES, useTheme } from '../themes'
import { errorMessage } from '../util'
import { UpdateNotice } from './UpdateNotice'

function Accounts({ suggestBaseUrl }: { suggestBaseUrl?: string }): React.JSX.Element {
  const [accounts, setAccounts] = useState<HostAccount[]>([])
  const [baseUrl, setBaseUrl] = useState(suggestBaseUrl ?? 'https://dev.azure.com/')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)

  const reload = useCallback(() => {
    window.host.accounts().then(setAccounts).catch(() => undefined)
  }, [])
  useEffect(reload, [reload])

  const connect = async (): Promise<void> => {
    setBusy(true)
    setNote(null)
    try {
      const acc = await window.host.addAccount('azure', baseUrl, token)
      window.dispatchEvent(new Event('arbor:accounts-changed'))
      setNote({ text: `Connected as ${acc.user}${acc.encrypted ? '' : ' (token stored without OS encryption)'}`, error: false })
      setToken('')
      reload()
    } catch (e) {
      setNote({ text: errorMessage(e), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-section">
      <h4>Accounts</h4>
      {accounts.length === 0 && <div className="empty">No hosting accounts connected</div>}
      {accounts.map((a) => (
        <div key={a.kind + a.baseUrl} className="settings-row account-row">
          <span>
            {a.kind === 'azure' ? 'Azure DevOps' : a.kind}
            <small>{a.baseUrl} · {a.user}</small>
          </span>
          <button
            className="danger"
            onClick={() =>
              window.host.removeAccount(a.kind, a.baseUrl).then(() => {
                reload()
                window.dispatchEvent(new Event('arbor:accounts-changed'))
              })
            }
          >
            Remove
          </button>
        </div>
      ))}
      <div className="settings-row column">
        <span>
          Add Azure DevOps organisation
          <small>Create a personal access token with Code (read &amp; write) scope at Organisation settings → Personal access tokens</small>
        </span>
        <span className="unit grow">
          <input value={baseUrl} spellCheck={false} placeholder="https://dev.azure.com/my-org" onChange={(e) => setBaseUrl(e.target.value)} />
        </span>
        <span className="unit grow">
          <input
            type="password"
            value={token}
            placeholder="Personal access token"
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void connect()
            }}
          />
          <button className="primary" disabled={busy || !token.trim() || !baseUrl.trim()} onClick={() => void connect()}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </span>
      </div>
      {note && <div className={`settings-note${note.error ? ' error' : ''}`}>{note.text}</div>}
    </section>
  )
}

export function SettingsDialog({ onClose, suggestBaseUrl }: { onClose: () => void; suggestBaseUrl?: string }): React.JSX.Element {
  const settings = useSettings()
  const theme = useTheme()
  const fileView = useFileView()
  const [gitPath, setGitPath] = useState(settings.gitPath)
  const [gitTest, setGitTest] = useState<string | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.native?.version().then(setVersion).catch(() => undefined)
  }, [])

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const applyGitPath = async (): Promise<void> => {
    const trimmed = gitPath.trim()
    setGitTest(null)
    setSettings({ gitPath: trimmed })
    try {
      const v = await window.git.gitVersion()
      setGitTest(v.trim())
    } catch (e) {
      setGitTest(`Error: ${errorMessage(e)}`)
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog settings-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h3>Settings</h3>
          <span className="muted">Arbor {version}</span>
          <button className="icon" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        <section className="settings-section">
          <h4>Appearance</h4>
          <label className="settings-row">
            <span>Theme</span>
            <select value={theme.id} onChange={(e) => setTheme(e.target.value)}>
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.dark ? '' : ' (light)'}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-row">
            <span>Changed files</span>
            <select value={fileView} onChange={(e) => setFileView(e.target.value === 'flat' ? 'flat' : 'tree')}>
              <option value="tree">Folder tree</option>
              <option value="flat">Flat list</option>
            </select>
          </label>
        </section>

        <section className="settings-section">
          <h4>Repository</h4>
          <label className="settings-row">
            <span>
              Refresh every
              <small>How often the open repository is checked for changes</small>
            </span>
            <span className="unit">
              <input
                type="number"
                min={SETTINGS_LIMITS.pollInterval.min}
                max={SETTINGS_LIMITS.pollInterval.max}
                value={settings.pollInterval}
                onChange={(e) => setSettings({ pollInterval: Number(e.target.value) })}
              />
              seconds
            </span>
          </label>
          <label className="settings-row">
            <span>
              History limit
              <small>Most recent commits loaded into the graph</small>
            </span>
            <span className="unit">
              <input
                type="number"
                min={SETTINGS_LIMITS.logLimit.min}
                max={SETTINGS_LIMITS.logLimit.max}
                step={100}
                value={settings.logLimit}
                onChange={(e) => setSettings({ logLimit: Number(e.target.value) })}
              />
              commits
            </span>
          </label>
        </section>

        <section className="settings-section">
          <h4>Git</h4>
          <label className="settings-row column">
            <span>
              Git executable
              <small>Leave empty to use the git on your PATH</small>
            </span>
            <span className="unit grow">
              <input
                value={gitPath}
                placeholder="git"
                spellCheck={false}
                onChange={(e) => setGitPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void applyGitPath()
                }}
              />
              <button onClick={() => void applyGitPath()}>Apply &amp; test</button>
            </span>
          </label>
          {gitTest && <div className={`settings-note${gitTest.startsWith('Error') ? ' error' : ''}`}>{gitTest}</div>}
        </section>

        <Accounts suggestBaseUrl={suggestBaseUrl} />

        <section className="settings-section">
          <h4>Updates</h4>
          <label className="settings-row">
            <span>
              Check for updates automatically
              <small>On launch and every six hours</small>
            </span>
            <input
              type="checkbox"
              checked={settings.autoUpdate}
              onChange={(e) => setSettings({ autoUpdate: e.target.checked })}
            />
          </label>
          <div className="settings-row">
            <span className="update-slot"><UpdateNotice /></span>
            <button onClick={() => window.updater.check()}>Check now</button>
          </div>
        </section>

        <div className="buttons">
          <button
            onClick={() => {
              setSettings({ pollInterval: SETTINGS_DEFAULTS.pollInterval, logLimit: SETTINGS_DEFAULTS.logLimit, autoUpdate: true, gitPath: '' })
              setGitPath('')
              setGitTest(null)
              setFileView('tree')
              setTheme('arbor-dark')
            }}
          >
            Reset to defaults
          </button>
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
