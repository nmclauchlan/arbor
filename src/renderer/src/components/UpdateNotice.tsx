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

export function UpdateNotice(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>(current)
  useEffect(() => subscribe(setStatus), [])

  switch (status.state) {
    case 'checking':
      return <span className="update-notice muted">Checking for updates…</span>
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
          <span className="bar"><div style={{ width: `${status.percent ?? 0}%` }} /></span>
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
