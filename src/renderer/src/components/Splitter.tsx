import { useCallback } from 'react'

export function Splitter({
  direction,
  value,
  onChange,
  invert,
  onReset
}: {
  direction: 'vertical' | 'horizontal'
  value: number
  onChange: (value: number) => void
  invert?: boolean
  onReset?: () => void
}): React.JSX.Element {
  const start = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const origin = direction === 'vertical' ? e.clientX : e.clientY
      const base = value
      document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize'
      document.body.classList.add('resizing')
      const move = (ev: MouseEvent): void => {
        const delta = (direction === 'vertical' ? ev.clientX : ev.clientY) - origin
        onChange(base + (invert ? -delta : delta))
      }
      const up = (): void => {
        document.body.style.cursor = ''
        document.body.classList.remove('resizing')
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    },
    [direction, value, onChange, invert]
  )
  return <div className={`splitter ${direction}`} onMouseDown={start} onDoubleClick={onReset} />
}
