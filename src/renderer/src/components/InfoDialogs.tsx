import { useEffect, useState } from 'react'
import { BrandIcon } from './BrandIcon'

function useEscape(onClose: () => void): void {
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
}

export function AboutDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [v, setV] = useState<{ app: string; electron: string; chrome: string; node: string; platform: string } | null>(null)
  useEffect(() => {
    window.native?.versions().then(setV).catch(() => undefined)
  }, [])
  useEscape(onClose)
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog about-dialog" role="dialog" aria-label="About Arbor" onMouseDown={(e) => e.stopPropagation()}>
        <div className="about-brand">
          <BrandIcon size={64} />
          <div>
            <h3>Arbor</h3>
            <p className="muted">A clearer view of every branch.</p>
          </div>
        </div>
        <table className="about-table">
          <tbody>
            <tr><td>Version</td><td>{v?.app ?? '…'}</td></tr>
            <tr><td>Electron</td><td>{v?.electron ?? '…'}</td></tr>
            <tr><td>Chromium</td><td>{v?.chrome ?? '…'}</td></tr>
            <tr><td>Node</td><td>{v?.node ?? '…'}</td></tr>
            <tr><td>Platform</td><td>{v?.platform ?? '…'}</td></tr>
          </tbody>
        </table>
        <div className="buttons">
          <button onClick={() => window.open('https://github.com/nmclauchlan/arbor')}>GitHub</button>
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl+T', 'Repository Management'],
  ['Ctrl+O', 'Open a repository'],
  ['Ctrl+W', 'Close the current tab'],
  ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous tab'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo the last git action'],
  ['Ctrl+B', 'Filter branches'],
  ['Ctrl+Enter', 'Commit'],
  ['Ctrl+S', 'Save the file being edited'],
  ['Ctrl+, ', 'Settings'],
  ['Ctrl+= / Ctrl+- / Ctrl+0', 'Zoom in / out / reset'],
  ['F11', 'Full screen'],
  ['Esc', 'Back to the graph, close menus and dialogs']
]

export function ShortcutsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  useEscape(onClose)
  const mac = window.native?.platform === 'darwin'
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog shortcuts-dialog" role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Keyboard shortcuts</h3>
        <table className="about-table">
          <tbody>
            {SHORTCUTS.map(([k, d]) => (
              <tr key={k}>
                <td><kbd>{mac ? k.replace(/Ctrl\+/g, '⌘') : k}</kbd></td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="buttons">
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
