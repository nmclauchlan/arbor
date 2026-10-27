import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'

let current: UpdateStatus = { state: 'idle' }
const listeners = new Set<(s: UpdateStatus) => void>()
let subscribed = false

function subscribe(cb: (s: UpdateStatus) => void): () => void {
  listeners.add(cb)
  if (!subscribed) {
    subscribed = true
    window.updater.status().then((s) => {
      current = s
      listeners.forEach((l) => l(s))
    })
    window.updater.onStatus((s) => {
      current = s
      listeners.forEach((l) => l(s))
    })
  }
  cb(current)
  return () => listeners.delete(cb)
}

let version: Promise<string> | null = null

export function AppVersion(): React.JSX.Element | null {
  const [text, setText] = useState('')
  useEffect(() => {
    let cancelled = false
    version ??= window.native?.version() ?? Promise.resolve('')
    void version.then((v) => !cancelled && setText(v))
    return () => {
      cancelled = true
    }
  }, [])
  if (!text) return null
  const open = (e: React.MouseEvent): void => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    window.dispatchEvent(new CustomEvent('arbor:version-menu', { detail: { x: rect.left, y: rect.top } }))
  }
  return (
    <button className="app-version" title={`Arbor ${text}. Right-click to check for updates`} onClick={open} onContextMenu={open}>
      v{text}
    </button>
  )
}

export function UpdateNotice(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>(current)
  useEffect(() => subscribe(setStatus), [])

  switch (status.state) {
    case 'checking':
      return <span className="update-notice checking muted" role="status">Checking for updates…</span>
    case 'available':
      return (
        <span className="update-notice">
          <span className="dot" /> Update {status.version} found, downloading…
        </span>
      )
    case 'downloading':
      return (
        <span className="update-notice" title={`Downloading Arbor ${status.version ?? ''}`}>
          <span className="dot" /> Downloading update
          <span className="bar" role="progressbar" aria-label="Downloading update" aria-valuemin={0} aria-valuemax={100} aria-valuenow={status.percent ?? 0}>
            <div style={{ width: `${status.percent ?? 0}%` }} />
          </span>
          {status.percent ?? 0}%
        </span>
      )
    case 'downloaded':
      return (
        <span
          className="update-notice clickable"
          title="Restart Arbor to install the update"
          onClick={() => window.updater.install()}
        >
          <span className="dot" /> Arbor {status.version} is ready — restart to update
        </span>
      )
    case 'error':
      return (
        <span className="update-notice error" title={status.message} onClick={() => window.updater.check()}>
          Update check failed
        </span>
      )
    default:
      return null
  }
}
