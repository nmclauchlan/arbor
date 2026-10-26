import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import type { Shell } from '../actions'
import { assemble, hasMarkers, parseConflicts, type Choice, type Segment } from '../conflicts'
import { errorMessage } from '../util'
import { currentTheme, subscribeTheme } from '../themes'
import { buildEditorTheme, editorHighlight, languageFor } from './Editor'

const CONTEXT_LINES = 3

function Context({ lines }: { lines: string[] }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const collapsible = lines.length > CONTEXT_LINES * 2 + 1 && !expanded
  const shown = collapsible ? [...lines.slice(0, CONTEXT_LINES), null, ...lines.slice(-CONTEXT_LINES)] : lines
  return (
    <div className="conflict-context">
      {shown.map((l, i) =>
        l === null ? (
          <div key={i} className="conflict-fold" onClick={() => setExpanded(true)}>
            ⋯ {lines.length - CONTEXT_LINES * 2} unchanged lines
          </div>
        ) : (
          <div key={i} className="line">{l || ' '}</div>
        )
      )}
    </div>
  )
}

function Side({
  title,
  label,
  lines,
  cls,
  chosen,
  onUse
}: {
  title: string
  label: string
  lines: string[]
  cls: string
  chosen: boolean
  onUse: () => void
}): React.JSX.Element {
  return (
    <div className={`conflict-side ${cls}${chosen ? ' chosen' : ''}`}>
      <div className="conflict-side-head">
        <span className="side-title">{title}</span>
        <span className="muted mono">{label}</span>
        <button className={chosen ? 'primary' : ''} onClick={onUse}>
          {chosen ? '✓ Used' : `Use ${title.toLowerCase()}`}
        </button>
      </div>
      <div className="conflict-lines">
        {lines.length === 0 ? <div className="line muted">(no lines)</div> : lines.map((l, i) => <div key={i} className="line">{l || ' '}</div>)}
      </div>
    </div>
  )
}

export function ConflictResolver({
  repoPath,
  file,
  shell,
  onResolved
}: {
  repoPath: string
  file: string
  shell: Shell
  onResolved: () => void
}): React.JSX.Element {
  const [segments, setSegments] = useState<Segment[] | null>(null)
  const [eol, setEol] = useState('\n')
  const [choices, setChoices] = useState<(Choice | null)[]>([])
  const [error, setError] = useState<string | null>(null)
  const [edited, setEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [action, setAction] = useState<'resolve' | 'ours' | 'theirs' | null>(null)
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const themeComp = useRef(new Compartment())
  const applying = useRef(false)

  useEffect(() => {
    let cancelled = false
    setSegments(null)
    setError(null)
    setEdited(false)
    ;(async () => {
      const [content, language] = await Promise.all([window.git.readFile(repoPath, file), languageFor(file)])
      if (cancelled || !host.current) return
      const parsed = parseConflicts(content)
      setSegments(parsed.segments)
      setEol(parsed.eol)
      setChoices(parsed.segments.map(() => null))
      view.current?.destroy()
      view.current = new EditorView({
        parent: host.current,
        state: EditorState.create({
          doc: content,
          extensions: [
            basicSetup,
            themeComp.current.of(buildEditorTheme(currentTheme().dark)),
            editorHighlight,
            language ?? [],
            EditorView.updateListener.of((u) => {
              if (u.docChanged && !applying.current) setEdited(true)
            })
          ]
        })
      })
    })().catch((e) => !cancelled && setError(errorMessage(e)))
    return () => {
      cancelled = true
      view.current?.destroy()
      view.current = null
    }
  }, [repoPath, file])

  useEffect(
    () =>
      subscribeTheme(() => {
        view.current?.dispatch({ effects: themeComp.current.reconfigure(buildEditorTheme(currentTheme().dark)) })
      }),
    []
  )

  const conflictCount = useMemo(() => segments?.filter((s) => s.kind === 'conflict').length ?? 0, [segments])
  const resolvedCount = useMemo(
    () => (segments ? segments.filter((s, i) => s.kind === 'conflict' && choices[i]).length : 0),
    [segments, choices]
  )

  const applyChoices = useCallback(
    (next: (Choice | null)[]) => {
      if (!segments || !view.current) return
      setChoices(next)
      const text = assemble(segments, next, eol)
      applying.current = true
      view.current.dispatch({ changes: { from: 0, to: view.current.state.doc.length, insert: text } })
      applying.current = false
      setEdited(false)
    },
    [segments, eol]
  )

  const choose = (idx: number, choice: Choice): void => {
    const next = [...choices]
    next[idx] = next[idx] === choice ? null : choice
    applyChoices(next)
  }

  const chooseAll = (choice: Choice): void => {
    if (!segments) return
    applyChoices(segments.map((s, i) => (s.kind === 'conflict' ? choice : choices[i])))
  }

  const markResolved = async (): Promise<void> => {
    if (!view.current) return
    const text = view.current.state.doc.toString()
    if (hasMarkers(text)) {
      const ok = await shell.confirm(
        'Conflict markers remain',
        'The result still contains conflict markers. Mark the file resolved anyway?',
        true
      )
      if (!ok) return
    }
    setBusy(true)
    setAction('resolve')
    try {
      await window.git.resolveFile(repoPath, file, text, null)
      shell.showInfo(`Resolved ${file}`)
      onResolved()
    } catch (e) {
      shell.showError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const takeWhole = async (side: 'ours' | 'theirs'): Promise<void> => {
    setBusy(true)
    setAction(side)
    try {
      await window.git.resolveFile(repoPath, file, null, side)
      shell.showInfo(`Resolved ${file} using ${side}`)
      onResolved()
    } catch (e) {
      shell.showError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div className="conflict-resolver"><div className="center">{error}</div></div>

  return (
    <div className="conflict-resolver">
      <div className="conflict-toolbar">
        <span>
          {segments ? `${resolvedCount} of ${conflictCount} conflict${conflictCount === 1 ? '' : 's'} resolved` : <><span className="spinner" aria-hidden /> Loading…</>}
          {edited && <span className="muted"> · result edited by hand</span>}
        </span>
        <span className="spacer" />
        <button disabled={!segments || busy} onClick={() => chooseAll('ours')}>All ours</button>
        <button disabled={!segments || busy} onClick={() => chooseAll('theirs')}>All theirs</button>
        <button disabled={busy} aria-busy={busy && action === 'ours'} onClick={() => takeWhole('ours')} title="Take the whole file from our side (git checkout --ours)">File: ours</button>
        <button disabled={busy} aria-busy={busy && action === 'theirs'} onClick={() => takeWhole('theirs')} title="Take the whole file from their side (git checkout --theirs)">File: theirs</button>
        <button className="primary" aria-busy={busy && action === 'resolve'} disabled={!segments || busy} onClick={markResolved}>
          Mark resolved
        </button>
      </div>
      <div className="conflict-body">
        <div className="conflict-segments">
          {segments?.map((seg, idx) =>
            seg.kind === 'text' ? (
              <Context key={idx} lines={seg.lines} />
            ) : (
              <div key={idx} className={`conflict-block${choices[idx] ? ' resolved' : ''}`}>
                <div className="conflict-block-head">
                  <span>Conflict {segments.slice(0, idx).filter((s) => s.kind === 'conflict').length + 1}</span>
                  <span className="spacer" />
                  <button className={choices[idx] === 'both' ? 'primary' : ''} onClick={() => choose(idx, 'both')}>
                    Use both
                  </button>
                  <button className={choices[idx] === 'both-reversed' ? 'primary' : ''} onClick={() => choose(idx, 'both-reversed')}>
                    Both, theirs first
                  </button>
                </div>
                <div className="conflict-sides">
                  <Side title="Ours" label={seg.oursLabel} lines={seg.ours} cls="ours" chosen={choices[idx] === 'ours'} onUse={() => choose(idx, 'ours')} />
                  <Side title="Theirs" label={seg.theirsLabel} lines={seg.theirs} cls="theirs" chosen={choices[idx] === 'theirs'} onUse={() => choose(idx, 'theirs')} />
                </div>
              </div>
            )
          )}
        </div>
        <div className="conflict-result">
          <div className="conflict-result-head">Result</div>
          <div className="editor-host" ref={host} />
        </div>
      </div>
    </div>
  )
}
