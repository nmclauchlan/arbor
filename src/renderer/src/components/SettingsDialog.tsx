import { useCallback, useEffect, useState } from 'react'
import type { HostAccount, HostKind, PullMode } from '@shared/types'
import { hostName } from '../util'
import { setFileView, useFileView } from '../fileView'
import { PULL_LABELS, SETTINGS_DEFAULTS, SETTINGS_LIMITS, setSettings, useSettings } from '../settings'
import { setTheme, THEMES, useTheme } from '../themes'
import { errorMessage } from '../util'
import { UpdateNotice } from './UpdateNotice'
import { Icon } from './Icon'

function Accounts({ suggestBaseUrl }: { suggestBaseUrl?: string }): React.JSX.Element {
  const [accounts, setAccounts] = useState<HostAccount[]>([])
  const [kind, setKind] = useState<HostKind>(
    !suggestBaseUrl || /dev\.azure\.com|visualstudio\.com/i.test(suggestBaseUrl) ? 'azure' : /gitlab/i.test(suggestBaseUrl) ? 'gitlab' : 'github'
  )
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
      const acc = await window.host.addAccount(kind, baseUrl, token)
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
            {hostName(a.kind)}
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
        <span className="unit">
          <select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as HostKind
              setKind(k)
              setBaseUrl(k === 'github' ? 'https://github.com' : k === 'gitlab' ? 'https://gitlab.com' : 'https://dev.azure.com/')
              setNote(null)
            }}
          >
            <option value="azure">Azure DevOps</option>
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
          </select>
          <small className="muted">
            {kind === 'azure'
              ? 'Personal access token with Code (read & write) and Build (read) scopes, from Organisation settings → Personal access tokens'
              : kind === 'gitlab'
                ? 'Personal access token with the api scope, from Preferences → Access tokens'
                : 'Personal access token with repository, pull-request, checks and commit-status access, from Settings → Developer settings → Tokens'}
          </small>
        </span>
        <span className="unit grow">
          <input
            value={baseUrl}
            spellCheck={false}
            placeholder={
              kind === 'github'
                ? 'https://github.com or https://github.my-company.com'
                : kind === 'gitlab'
                  ? 'https://gitlab.com or https://gitlab.my-company.com'
                  : 'https://dev.azure.com/my-org'
            }
            onChange={(e) => setBaseUrl(e.target.value)}
          />
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
          <button className="primary" aria-busy={busy} disabled={busy || !token.trim() || !baseUrl.trim()} onClick={() => void connect()}>
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
  const [testing, setTesting] = useState(false)
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
    setTesting(true)
    setSettings({ gitPath: trimmed })
    try {
      const v = await window.git.gitVersion()
      setGitTest(v.trim())
    } catch (e) {
      setGitTest(`Error: ${errorMessage(e)}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog settings-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h3>Settings</h3>
          <span className="muted">Arbor {version}</span>
          <button className="icon" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <Icon name="close" />
          </button>
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
          <label className="settings-row">
            <span>
              Author avatars in the graph
              <small>Pictures come from Gravatar and GitHub, looked up by a hash of each author's email</small>
            </span>
            <input type="checkbox" checked={settings.showAvatars} onChange={(e) => setSettings({ showAvatars: e.target.checked })} />
          </label>
          <label className="settings-row">
            <span>
              Commit body preview
              <small>Show the start of each commit's description after its subject</small>
            </span>
            <input type="checkbox" checked={settings.showBodyPreview} onChange={(e) => setSettings({ showBodyPreview: e.target.checked })} />
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
              Check for incoming commits every
              <small>Fetches open repositories in the background; 0 turns it off</small>
            </span>
            <span className="unit">
              <input
                type="number"
                min={0}
                max={120}
                value={settings.backgroundFetch}
                onChange={(e) => setSettings({ backgroundFetch: Number(e.target.value) })}
              />
              minutes
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
          <label className="settings-row">
            <span>
              Pull with
              <small>How Pull brings in commits when your branch and its upstream have both moved on. Rebase stashes your changes first.</small>
            </span>
            <select value={settings.pullMode} onChange={(e) => setSettings({ pullMode: e.target.value as PullMode })}>
              {(Object.keys(PULL_LABELS) as PullMode[]).map((m) => (
                <option key={m} value={m}>
                  {PULL_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
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
              <button aria-busy={testing} disabled={testing} onClick={() => void applyGitPath()}>Apply &amp; test</button>
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
