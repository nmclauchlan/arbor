import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuItem {
  label?: string
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  separator?: boolean
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

export function ContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = Math.min(menu.x, window.innerWidth - rect.width - 4)
    const y = Math.min(menu.y, window.innerHeight - rect.height - 4)
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
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {menu.items.map((item, i) =>
        item.separator ? (
          <div key={i} className="sep" />
        ) : (
          <div
            key={i}
            className={`item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`}
            onClick={() => {
              onClose()
              item.onClick?.()
            }}
          >
            {item.label}
          </div>
        )
      )}
    </div>
  )
}
