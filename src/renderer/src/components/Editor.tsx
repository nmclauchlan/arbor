import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { basicSetup } from 'codemirror'
import type { Shell } from '../actions'
import { errorMessage } from '../util'

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--bg)' },
  '.cm-scroller': { fontFamily: 'var(--mono)', fontSize: '12px', lineHeight: '18px' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', borderRight: '1px solid var(--border)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--bg-3)' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' }
})

async function languageFor(file: string) {
  const name = file.split('/').pop() ?? file
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  const desc = languages.find(
    (l) => (ext && l.extensions.includes(ext)) || (l.filename ? l.filename.test(name) : false)
  )
  return desc ? desc.load() : null
}

export function Editor({
  repoPath,
  file,
  shell,
  onClose,
  onSaved
}: {
  repoPath: string
  file: string
  shell: Shell
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(async (): Promise<boolean> => {
    if (!view.current) return false
    try {
      await window.git.writeFile(repoPath, file, view.current.state.doc.toString())
      setDirty(false)
      onSaved()
      return true
    } catch (e) {
      shell.showError(errorMessage(e))
      return false
    }
  }, [repoPath, file, onSaved, shell])
  const saveRef = useRef(save)
  saveRef.current = save

  const close = useCallback(async () => {
    if (dirty) {
      const ok = await shell.confirm('Unsaved changes', `Discard unsaved changes to ${file}?`, true)
      if (!ok) return
    }
    onClose()
  }, [dirty, file, onClose, shell])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setDirty(false)
    ;(async () => {
      const [content, language] = await Promise.all([window.git.readFile(repoPath, file), languageFor(file)])
      if (cancelled || !host.current) return
      view.current?.destroy()
      view.current = new EditorView({
        parent: host.current,
        state: EditorState.create({
          doc: content,
          extensions: [
            basicSetup,
            oneDark,
            theme,
            keymap.of([
              indentWithTab,
              { key: 'Mod-s', run: () => { void saveRef.current(); return true } }
            ]),
            language ?? [],
            EditorView.updateListener.of((u) => {
              if (u.docChanged) setDirty(true)
            })
          ]
        })
      })
      view.current.focus()
      setLoading(false)
    })().catch((e) => {
      if (!cancelled) {
        setError(errorMessage(e))
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
      view.current?.destroy()
      view.current = null
    }
  }, [repoPath, file])

  return (
    <div className="editor">
      <div className="editor-bar">
        <span className="editor-title" title={file}>
          {file}
          {dirty ? ' •' : ''}
        </span>
        <button className="primary" disabled={!dirty || loading} onClick={() => void save()} title="Ctrl+S">
          Save
        </button>
        <button onClick={() => void close()}>Close</button>
      </div>
      {error ? (
        <div className="center">{error}</div>
      ) : (
        <div className="editor-host" ref={host}>
          {loading && <div className="center">Loading…</div>}
        </div>
      )}
    </div>
  )
}
