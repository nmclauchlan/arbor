import { useCallback, useEffect, useRef, useState } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { tags as t } from '@lezer/highlight'
import { basicSetup } from 'codemirror'
import type { Shell } from '../actions'
import { errorMessage } from '../util'
import { currentTheme, subscribeTheme } from '../themes'

export const editorHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: 'var(--syn-keyword)' },
    { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syn-string)' },
    { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
    { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
    { tag: [t.typeName, t.className, t.namespace], color: 'var(--syn-type)' },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.variableName)], color: 'var(--syn-function)' },
    { tag: [t.propertyName, t.attributeName, t.labelName], color: 'var(--syn-property)' },
    { tag: [t.tagName, t.angleBracket], color: 'var(--syn-tag)' },
    { tag: [t.operator, t.punctuation, t.separator], color: 'var(--syn-operator)' },
    { tag: t.heading, fontWeight: 'bold', color: 'var(--syn-function)' },
    { tag: t.link, color: 'var(--accent)', textDecoration: 'underline' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.invalid, color: 'var(--red)' }
  ])
)

export function buildEditorTheme(dark: boolean) {
  return EditorView.theme(
    {
      '&': { height: '100%', backgroundColor: 'var(--bg)', color: 'var(--fg)' },
      '.cm-scroller': { fontFamily: 'var(--mono)', fontSize: '12px', lineHeight: '18px' },
      '.cm-content': { caretColor: 'var(--fg)' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'var(--select-bg)'
      },
      '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--fg-faint)', borderRight: '1px solid var(--border)' },
      '.cm-activeLineGutter': { backgroundColor: 'var(--bg-3)' },
      '.cm-activeLine': { backgroundColor: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' },
      '.cm-matchingBracket': { backgroundColor: 'var(--bg-4)', outline: '1px solid var(--accent)' },
      '.cm-foldPlaceholder': { backgroundColor: 'var(--bg-3)', border: 'none', color: 'var(--fg-dim)' },
      '.cm-tooltip': { backgroundColor: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--fg)' },
      '.cm-panels': { backgroundColor: 'var(--bg-2)', color: 'var(--fg)' },
      '.cm-searchMatch': { backgroundColor: 'rgba(241, 163, 60, 0.35)' },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(241, 163, 60, 0.6)' }
    },
    { dark }
  )
}

export async function languageFor(file: string) {
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
  const themeComp = useRef(new Compartment())
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
            themeComp.current.of(buildEditorTheme(currentTheme().dark)),
            editorHighlight,
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

  useEffect(
    () =>
      subscribeTheme(() => {
        view.current?.dispatch({ effects: themeComp.current.reconfigure(buildEditorTheme(currentTheme().dark)) })
      }),
    []
  )

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
