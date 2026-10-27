import { useEffect, useState } from 'react'
import type { BuildFailure, BuildState, CommitBuild } from '@shared/types'
import { errorMessage } from '../util'
import { Spinner } from './Spinner'

const PRIORITY: BuildState[] = ['failed', 'partial', 'running', 'queued', 'succeeded', 'cancelled', 'skipped']

const LABELS: Record<BuildState, string> = {
  succeeded: 'Passed',
  failed: 'Failed',
  partial: 'Partially succeeded',
  running: 'Running',
  queued: 'Queued',
  cancelled: 'Cancelled',
  skipped: 'Skipped'
}

export function rollupState(builds: CommitBuild[]): BuildState | null {
  for (const state of PRIORITY) if (builds.some((b) => b.state === state)) return state
  return null
}

export function buildLabel(state: BuildState): string {
  return LABELS[state]
}

export function BuildIcon({ state }: { state: BuildState }): React.JSX.Element {
  return (
    <svg className={`build-icon ${state}`} viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {state === 'running' || state === 'queued' ? (
        <circle cx="8" cy="8" r="5.8" strokeDasharray={state === 'running' ? '9 4' : '2 3'} />
      ) : (
        <circle cx="8" cy="8" r="6.2" />
      )}
      {state === 'succeeded' && <path d="m5.2 8.2 1.9 1.9 3.8-4" />}
      {state === 'failed' && <path d="m5.8 5.8 4.4 4.4m0-4.4-4.4 4.4" />}
      {state === 'partial' && <path d="M8 4.8v3.6m0 2.6v.1" />}
      {(state === 'cancelled' || state === 'skipped') && <path d="m4.4 11.6 7.2-7.2" />}
    </svg>
  )
}

export function BuildMarker({ builds }: { builds: CommitBuild[] }): React.JSX.Element | null {
  const state = rollupState(builds)
  if (!state) return null
  const title = builds.map((b) => `${buildLabel(b.state)}: ${b.name}${b.ref ? ` (${b.ref})` : ''}`).join('\n')
  return (
    <span className="build-marker" title={title} aria-label={`Builds ${buildLabel(state).toLowerCase()}`} data-build-state={state}>
      <BuildIcon state={state} />
    </span>
  )
}

type FailureState = 'loading' | { error: string } | BuildFailure[]

export function BuildsSection({ repoPath, builds, error }: { repoPath: string; builds?: CommitBuild[]; error?: string | null }): React.JSX.Element | null {
  const [failures, setFailures] = useState<Record<string, FailureState>>({})
  const failedKey = JSON.stringify((builds ?? []).filter((b) => b.state === 'failed' || b.state === 'partial').slice(0, 3))

  useEffect(() => {
    let cancelled = false
    const failed = JSON.parse(failedKey) as CommitBuild[]
    setFailures(Object.fromEntries(failed.map((b) => [b.id, 'loading' as const])))
    for (const b of failed) {
      window.host
        .buildFailures(repoPath, b)
        .then((list) => !cancelled && setFailures((f) => ({ ...f, [b.id]: list })))
        .catch((e) => !cancelled && setFailures((f) => ({ ...f, [b.id]: { error: errorMessage(e) } })))
    }
    return () => {
      cancelled = true
    }
  }, [repoPath, failedKey])

  if (!builds?.length && !error) return null
  return (
    <div className="builds-section">
      <div className="file-group-title">
        <span>Builds{builds?.length ? ` (${builds.length})` : ''}</span>
      </div>
      {error && <div className="builds-note">Build status unavailable: {error}</div>}
      {builds?.map((b) => {
        const f = failures[b.id]
        return (
          <div key={b.id} className={`build-row ${b.state}`}>
            <div className="build-head">
              <BuildIcon state={b.state} />
              <a className="name" href={b.url} target="_blank" rel="noreferrer" title={`Open ${b.name}`}>
                {b.name}
              </a>
              {b.ref && <span className="muted">{b.ref}</span>}
              {b.pullRequest !== undefined && <span className="muted">#{b.pullRequest}</span>}
              <span className="muted state">{buildLabel(b.state)}</span>
            </div>
            {f === 'loading' && (
              <div className="build-step muted">
                <Spinner /> Loading errors…
              </div>
            )}
            {f && f !== 'loading' && !Array.isArray(f) && <div className="build-step muted">{f.error}</div>}
            {Array.isArray(f) && !f.length && <div className="build-step muted">No failed steps were reported.</div>}
            {Array.isArray(f) &&
              f.map((s, i) => (
                <div key={i} className="build-step">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.step}
                    </a>
                  ) : (
                    <strong>{s.step}</strong>
                  )}
                  {s.messages.length ? <pre>{s.messages.join('\n')}</pre> : <span className="muted"> No error messages were reported.</span>}
                </div>
              ))}
          </div>
        )
      })}
    </div>
  )
}
