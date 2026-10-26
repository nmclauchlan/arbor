import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuItem {
  label?: string
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  items?: MenuItem[]
  hint?: string
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

function compact(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = []
  for (const item of items) {
    if (item.separator && (!out.length || out[out.length - 1].separator)) continue
    if (item.items && !item.items.length) continue
    out.push(item)
  }
  while (out.length && out[out.length - 1].separator) out.pop()
  return out
}

function MenuList({ items, onClose, nested }: { items: MenuItem[]; onClose: () => void; nested?: boolean }): React.JSX.Element {
  const [openSub, setOpenSub] = useState<number | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const list = compact(items)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const hover = (i: number, hasSub: boolean): void => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpenSub(hasSub ? i : null), hasSub ? 80 : 150)
  }

  return (
    <div className={`context-menu${nested ? ' nested' : ''}`} role="menu" onMouseDown={(e) => e.stopPropagation()}>
      {list.map((item, i) =>
        item.separator ? (
          <div key={i} className="sep" role="separator" />
        ) : (
          <div
            key={i}
            role="menuitem"
            aria-haspopup={item.items ? 'menu' : undefined}
            aria-expanded={item.items ? openSub === i : undefined}
            aria-disabled={item.disabled || undefined}
            className={`item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}${item.items ? ' has-sub' : ''}${openSub === i ? ' sub-open' : ''}`}
            onMouseEnter={() => hover(i, !!item.items)}
            onClick={() => {
              if (item.items) {
                setOpenSub(i)
                return
              }
              onClose()
              item.onClick?.()
            }}
          >
            <span className="label">{item.label}</span>
            {item.hint && <span className="hint">{item.hint}</span>}
            {item.items && <span className="chev">›</span>}
            {item.items && openSub === i && <Submenu items={item.items} onClose={onClose} />}
          </div>
        )
      )}
    </div>
  )
}

function Submenu({ items, onClose }: { items: MenuItem[]; onClose: () => void }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [flip, setFlip] = useState({ x: false, y: 0 })

  useLayoutEffect(() => {
    const el = ref.current?.firstElementChild as HTMLElement | null
    if (!el) return
    const rect = el.getBoundingClientRect()
    setFlip({
      x: rect.right > window.innerWidth - 4,
      y: rect.bottom > window.innerHeight - 4 ? window.innerHeight - 4 - rect.bottom : 0
    })
  }, [])

  return (
    <div ref={ref} className={`submenu-anchor${flip.x ? ' flip' : ''}`} style={{ marginTop: flip.y }} onClick={(e) => e.stopPropagation()}>
      <MenuList items={items} onClose={onClose} nested />
    </div>
  )
}

export function ContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const el = ref.current.firstElementChild as HTMLElement | null
    const rect = (el ?? ref.current).getBoundingClientRect()
    const x = Math.max(4, Math.min(menu.x, window.innerWidth - rect.width - 4))
    const y = Math.max(4, Math.min(menu.y, window.innerHeight - rect.height - 4))
    setPos({ x, y })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const close = (): void => onClose()
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', key)
    }
  }, [menu, onClose])

  if (!menu) return null
  return (
    <div ref={ref} className="context-menu-root" style={{ left: pos.x, top: pos.y }}>
      <MenuList items={menu.items} onClose={onClose} />
    </div>
  )
}
