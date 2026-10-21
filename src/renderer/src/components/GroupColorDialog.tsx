import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import type { TabGroup } from '../tabs'
import { GROUP_COLOR_PALETTES, normalizeGroupColor, paletteFromColorHuntUrl } from '../tabColors'

type Palette = { name: string; colors: readonly string[]; source: string }

export function GroupColorDialog({
  group,
  onClose,
  onApply
}: {
  group: TabGroup
  onClose: () => void
  onApply: (color: string) => void
}): React.JSX.Element {
  const id = useId()
  const initialColor = normalizeGroupColor(group.color) ?? '#84a9ac'
  const [hex, setHex] = useState(initialColor)
  const [previewColor, setPreviewColor] = useState(initialColor)
  const [paletteUrl, setPaletteUrl] = useState('')
  const [importedPalette, setImportedPalette] = useState<Palette | null>(null)
  const [importNote, setImportNote] = useState<{ text: string; error: boolean } | null>(null)
  const dialog = useRef<HTMLFormElement>(null)
  const hexInput = useRef<HTMLInputElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const color = normalizeGroupColor(hex)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = (): HTMLElement[] => Array.from(
      dialog.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
      ) ?? []
    ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0)

    hexInput.current?.focus({ preventScroll: true })
    hexInput.current?.select()

    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close.current()
      } else if (event.key === 'Tab') {
        const elements = focusable()
        const first = elements[0]
        const last = elements[elements.length - 1]
        const active = document.activeElement
        if (!first) {
          event.preventDefault()
          dialog.current?.focus()
        } else if (event.shiftKey && (active === first || !dialog.current?.contains(active))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (active === last || !dialog.current?.contains(active))) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    const containFocus = (event: FocusEvent): void => {
      if (event.target instanceof Node && !dialog.current?.contains(event.target)) {
        hexInput.current?.focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', key, true)
    document.addEventListener('focusin', containFocus)
    return () => {
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('focusin', containFocus)
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  const chooseColor = (value: string): void => {
    const normalized = normalizeGroupColor(value)
    if (!normalized) return
    setHex(normalized)
    setPreviewColor(normalized)
  }

  const apply = (event: FormEvent): void => {
    event.preventDefault()
    if (!color) {
      hexInput.current?.focus()
      return
    }
    onApply(color)
    onClose()
  }

  const importPalette = (): void => {
    const colors = paletteFromColorHuntUrl(paletteUrl)
    if (!colors) {
      setImportNote({ text: 'Paste a full https://colorhunt.co/palette/… link with its palette color code.', error: true })
      return
    }
    setImportedPalette({
      name: 'Your Color Hunt palette',
      colors,
      source: `https://colorhunt.co/palette/${colors.map((value) => value.slice(1)).join('')}`
    })
    setImportNote({ text: 'Palette added below. Choose a swatch to preview it.', error: false })
  }

  const swatches = (palette: Palette): React.JSX.Element => (
    <div className="group-color-palette" key={palette.source}>
      <div className="group-color-palette-head">
        <span>{palette.name}</span>
        <a href={palette.source} target="_blank" rel="noreferrer" aria-label={`View ${palette.name} on Color Hunt`}>
          Color Hunt <span aria-hidden="true">↗</span>
        </a>
      </div>
      <div className="group-color-swatches" role="group" aria-label={palette.name}>
        {palette.colors.map((value, index) => (
          <button
            key={`${value}-${index}`}
            type="button"
            className="group-color-swatch"
            style={{ '--swatch-color': value } as CSSProperties}
            aria-label={`${palette.name}, ${value}`}
            aria-pressed={color === value}
            title={value.toUpperCase()}
            onClick={() => chooseColor(value)}
          >
            {color === value && <span className="group-color-selected" aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    </div>
  )

  return createPortal(
    <div
      className="overlay group-color-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        className="dialog group-color-dialog"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        tabIndex={-1}
        noValidate
        onSubmit={apply}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <header className="group-color-head">
          <div>
            <h3 id={`${id}-title`}>Group color</h3>
            <p id={`${id}-description`}>Give {group.name} a color of its own.</p>
          </div>
          <button type="button" className="icon" aria-label="Close group color dialog" onClick={onClose}>✕</button>
        </header>

        <div className="group-color-body">
          <div className="group-color-custom">
            <div className="group-color-preview-area">
              <span className="group-color-label">Preview</span>
              <span className="tab-group group-color-preview" style={{ '--group-color': previewColor } as CSSProperties}>
                <span className="group-color-preview-name">{group.name}</span>
                <span className="caret" aria-hidden="true">⌄</span>
              </span>
            </div>
            <div className="group-color-fields">
              <label className="group-color-picker-field" htmlFor={`${id}-picker`}>
                <span className="group-color-label">Custom</span>
                <input
                  id={`${id}-picker`}
                  type="color"
                  value={previewColor}
                  onChange={(event) => chooseColor(event.target.value)}
                  aria-label="Choose a custom group color"
                />
              </label>
              <label className="group-color-hex-field" htmlFor={`${id}-hex`}>
                <span className="group-color-label">Hex color</span>
                <input
                  id={`${id}-hex`}
                  ref={hexInput}
                  type="text"
                  value={hex}
                  placeholder="#84a9ac"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={!color}
                  aria-describedby={`${id}-hex-help`}
                  onChange={(event) => {
                    setHex(event.target.value)
                    const normalized = normalizeGroupColor(event.target.value)
                    if (normalized) setPreviewColor(normalized)
                  }}
                  onBlur={() => {
                    if (color) setHex(color)
                  }}
                />
              </label>
            </div>
          </div>
          <p id={`${id}-hex-help`} className={`group-color-help${color ? '' : ' error'}`}>
            {color ? 'Choose any color, or explore a palette below.' : 'Enter a valid hex color, such as #84A9AC or #8AC.'}
          </p>

          <section className="group-color-curated" aria-labelledby={`${id}-palettes`}>
            <div className="group-color-section-head">
              <h4 id={`${id}-palettes`}>Curated palettes</h4>
              <span>Saved here for offline use</span>
            </div>
            <div className="group-color-palette-list">
              {GROUP_COLOR_PALETTES.map(swatches)}
            </div>
          </section>

          <details className="group-color-import">
            <summary>Add a Color Hunt palette</summary>
            <label htmlFor={`${id}-palette-url`}>Palette link</label>
            <div className="group-color-import-row">
              <input
                id={`${id}-palette-url`}
                type="url"
                value={paletteUrl}
                placeholder="https://colorhunt.co/palette/…"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={importNote?.error ?? false}
                aria-describedby={`${id}-import-help`}
                onChange={(event) => {
                  setPaletteUrl(event.target.value)
                  setImportNote(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    importPalette()
                  }
                }}
              />
              <button type="button" disabled={!paletteUrl.trim()} onClick={importPalette}>Add palette</button>
            </div>
            <p id={`${id}-import-help`} className={`group-color-help${importNote?.error ? ' error' : ''}`} role="status">
              {importNote?.text ?? 'Paste a palette link to use its four colors.'}
            </p>
            {importedPalette && swatches(importedPalette)}
          </details>
        </div>

        <footer className="buttons group-color-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" type="submit" disabled={!color}>Apply color</button>
        </footer>
      </form>
    </div>,
    document.body
  )
}
