import { useEffect, useState } from 'react'
import type { HostInfo, PullRequest, RepoRefs } from '@shared/types'
import { errorMessage, hostPath, prNoun } from '../util'

function defaultTarget(refs: RepoRefs, source: string): string {
  const names = refs.remotes.map((r) => r.name)
  for (const candidate of ['main', 'master', 'develop', 'dev']) if (names.includes(candidate) && candidate !== source) return candidate
  return names.find((n) => n !== source) ?? ''
}

export function CreatePrDialog({
  repoPath,
  host,
  refs,
  source,
  defaultTitle,
  onCreated,
  onClose
}: {
  repoPath: string
  host: HostInfo
  refs: RepoRefs
  source: string
  defaultTitle: string
  onCreated: (pr: PullRequest) => void
  onClose: () => void
}): React.JSX.Element {
  const [title, setTitle] = useState(defaultTitle)
  const [target, setTarget] = useState(() => defaultTarget(refs, source))
  const [description, setDescription] = useState('')
  const [draft, setDraft] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const targets = [...new Set(refs.remotes.map((r) => r.name))].filter((n) => n !== source).sort()

  const submit = async (): Promise<void> => {
    if (!title.trim() || !target) return
    setBusy(true)
    setError(null)
    try {
      const pr = await window.host.createPullRequest(repoPath, source, target, title.trim(), description, draft)
      onCreated(pr)
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog pr-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h3>New {prNoun(host.kind)}</h3>
        <p className="muted">{hostPath(host)}</p>
        <div className="pr-form-row">
          <span className="ref-badge branch">{source}</span>
          <span className="muted">into</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <input autoFocus value={title} placeholder="Title" onChange={(e) => setTitle(e.target.value)} />
        <textarea
          value={description}
          placeholder="Description (optional)"
          rows={6}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void submit()
          }}
        />
        <label className="pr-draft-row">
          <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Create as draft
        </label>
        {error && <div className="settings-note error">{error}</div>}
        <div className="buttons">
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" aria-busy={busy} disabled={busy || !title.trim() || !target} onClick={() => void submit()}>
            {busy ? 'Creating…' : `Create ${prNoun(host.kind)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
