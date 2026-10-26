import { useEffect, useRef, useState } from 'react'

export type MenuEntry =
  | { label: string; shortcut?: string; onSelect: () => void; disabled?: boolean; checked?: boolean }
  | { separator: true }

export interface MenuDef {
  label: string
  items: MenuEntry[]
}

export function MenuBar({ menus }: { menus: MenuDef[] }): React.JSX.Element {
  const [open, setOpen] = useState<number | null>(null)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (open === null) return
    const down = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + 1) % menus.length))
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i - 1 + menus.length) % menus.length))
    }
    const blur = (): void => setOpen(null)
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', blur)
    }
  }, [open, menus.length])

  return (
    <nav className="menubar" ref={ref} role="menubar" aria-label="Application menu">
      {menus.map((m, i) => (
        <div key={m.label} className="menubar-item">
          <button
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            className={open === i ? 'open' : ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen((cur) => (cur === i ? null : i))}
            onMouseEnter={() => setOpen((cur) => (cur === null ? cur : i))}
          >
            {m.label}
          </button>
          {open === i && (
            <div className="menubar-dropdown" role="menu" aria-label={m.label}>
              {m.items.map((item, k) =>
                'separator' in item ? (
                  <div key={k} className="sep" role="separator" />
                ) : (
                  <button
                    key={k}
                    role="menuitem"
                    className="menubar-entry"
                    disabled={item.disabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(null)
                      item.onSelect()
                    }}
                  >
                    <span className="check">{item.checked ? '✓' : ''}</span>
                    <span className="label">{item.label}</span>
                    {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}
