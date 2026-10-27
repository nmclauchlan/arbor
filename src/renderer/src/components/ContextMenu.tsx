import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const LayerContext = createContext<HTMLElement | null>(null)

export interface MenuItem {
  label?: string
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  items?: MenuItem[]
  hint?: string
  checked?: boolean
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
  above?: boolean
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
  const ticks = list.some((i) => i.checked !== undefined)

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
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
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
            {ticks && (
              <span className="check" aria-hidden="true">
                {item.checked ? '✓' : ''}
              </span>
            )}
            <span className="label">{item.label}</span>
            {item.hint && <span className="hint">{item.hint}</span>}
            {item.items && <span className="chev">›</span>}
            {item.items && openSub === i && <Submenu items={item.items} onClose={onClose} index={i} />}
          </div>
        )
      )}
    </div>
  )
}

function Submenu({ items, onClose, index }: { items: MenuItem[]; onClose: () => void; index: number }): React.JSX.Element | null {
  const layer = useContext(LayerContext)
  const anchor = useRef<HTMLSpanElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const item = anchor.current?.parentElement
    const menu = ref.current?.firstElementChild as HTMLElement | null
    if (!item || !menu) return
    const r = item.getBoundingClientRect()
    const w = menu.offsetWidth
    const h = menu.offsetHeight
    let left = r.right - 2
    if (left + w > window.innerWidth - 4) left = Math.max(4, r.left - w + 2)
    let top = r.top - 5
    if (top + h > window.innerHeight - 4) top = Math.max(4, window.innerHeight - 4 - h)
    setPos({ left, top })
  }, [index])

  return (
    <span ref={anchor} className="submenu-anchor-point">
      {layer &&
        createPortal(
          <div
            ref={ref}
            className="submenu-layer"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <MenuList items={items} onClose={onClose} nested />
          </div>,
          layer
        )}
    </span>
  )
}

export function ContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [layer, setLayer] = useState<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const el = ref.current.firstElementChild as HTMLElement | null
    const rect = (el ?? ref.current).getBoundingClientRect()
    const x = Math.max(4, Math.min(menu.x, window.innerWidth - rect.width - 4))
    const y = Math.max(4, Math.min(menu.above ? menu.y - rect.height - 4 : menu.y, window.innerHeight - rect.height - 4))
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
    <>
      <div ref={ref} className="context-menu-root" style={{ left: pos.x, top: pos.y }}>
        <LayerContext.Provider value={layer}>
          <MenuList items={menu.items} onClose={onClose} />
        </LayerContext.Provider>
      </div>
      <div ref={setLayer} className="context-menu-layer" onMouseDown={(e) => e.stopPropagation()} />
    </>
  )
}
