import { useEffect, useRef, useState } from 'react'
import type { ImageDiffResult, ImageSource } from '@shared/types'
import { errorMessage } from '../util'

type Mode = 'two-up' | 'swipe' | 'onion' | 'difference'

interface Dims {
  w: number
  h: number
}

const MODES: { id: Mode; label: string }[] = [
  { id: 'two-up', label: '2-up' },
  { id: 'swipe', label: 'Swipe' },
  { id: 'onion', label: 'Onion skin' },
  { id: 'difference', label: 'Difference' }
]

function dataUrl(mime: string, data: string): string {
  return `data:${mime};base64,${data}`
}

function Single({ src, label, cls }: { src: string; label: string; cls: string }): React.JSX.Element {
  const [dims, setDims] = useState<Dims | null>(null)
  return (
    <div className="image-single">
      <div className={`image-label ${cls}`}>
        {label}
        {dims && <span className="muted"> {dims.w} × {dims.h}px</span>}
      </div>
      <div className="checker">
        <img src={src} onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
      </div>
    </div>
  )
}

function Overlay({
  mode,
  oldSrc,
  newSrc
}: {
  mode: Exclude<Mode, 'two-up'>
  oldSrc: string
  newSrc: string
}): React.JSX.Element {
  const [value, setValue] = useState(50)
  const wrap = useRef<HTMLDivElement>(null)
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const update = (): void => setMaxHeight(Math.max(80, el.clientHeight - 44))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const newStyle: React.CSSProperties =
    mode === 'swipe'
      ? { clipPath: `inset(0 ${100 - value}% 0 0)` }
      : mode === 'onion'
        ? { opacity: value / 100 }
        : { mixBlendMode: 'difference' }
  return (
    <div className="image-overlay" ref={wrap}>
      <div className="image-stage checker">
        <img className="layer old" src={oldSrc} style={{ maxHeight }} />
        <img className="layer new" src={newSrc} style={newStyle} />
        {mode === 'swipe' && <div className="swipe-line" style={{ left: `${value}%` }} />}
      </div>
      {mode !== 'difference' && (
        <div className="image-slider">
          <span className="image-label deleted">{mode === 'swipe' ? 'Deleted' : 'Deleted'}</span>
          <input type="range" min={0} max={100} value={value} onChange={(e) => setValue(Number(e.target.value))} />
          <span className="image-label added">Added</span>
        </div>
      )}
      {mode === 'difference' && (
        <div className="image-slider muted">Identical pixels appear black</div>
      )}
    </div>
  )
}

export function ImageDiff({
  repoPath,
  file,
  oldPath,
  source
}: {
  repoPath: string
  file: string
  oldPath?: string
  source: ImageSource
}): React.JSX.Element {
  const [result, setResult] = useState<ImageDiffResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('two-up')
  const sourceKey = JSON.stringify(source)

  useEffect(() => {
    let cancelled = false
    setResult(null)
    setError(null)
    window.git
      .imageDiff(repoPath, file, oldPath, JSON.parse(sourceKey))
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && setError(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [repoPath, file, oldPath, sourceKey])

  if (error) return <div className="image-diff"><div className="center">{error}</div></div>
  if (!result) return <div className="image-diff"><div className="center">Loading…</div></div>

  const oldSrc = result.oldData ? dataUrl(result.mime, result.oldData) : null
  const newSrc = result.newData ? dataUrl(result.mime, result.newData) : null

  if (!oldSrc && !newSrc) return <div className="image-diff"><div className="center">No image data</div></div>

  if (!oldSrc || !newSrc) {
    return (
      <div className="image-diff">
        <div className="image-body">
          {newSrc ? <Single src={newSrc} label="Added" cls="added" /> : <Single src={oldSrc!} label="Deleted" cls="deleted" />}
        </div>
      </div>
    )
  }

  return (
    <div className="image-diff">
      <div className="image-modes">
        {MODES.map((m) => (
          <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="image-body">
        {mode === 'two-up' ? (
          <div className="image-two-up">
            <Single src={oldSrc} label="Deleted" cls="deleted" />
            <Single src={newSrc} label="Added" cls="added" />
          </div>
        ) : (
          <Overlay key={mode} mode={mode} oldSrc={oldSrc} newSrc={newSrc} />
        )}
      </div>
    </div>
  )
}
