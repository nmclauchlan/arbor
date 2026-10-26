import { useEffect, useState } from 'react'

const urlCache = new Map<string, string | null>()
const pending = new Map<string, Promise<string | null>>()
const failed = new Set<string>()

function githubNoreply(email: string): string | null {
  const m = /^(?:(\d+)\+)?([^@]+)@users\.noreply\.github\.com$/i.exec(email)
  if (!m) return null
  return m[1] ? `https://avatars.githubusercontent.com/u/${m[1]}?s=64&v=4` : `https://github.com/${encodeURIComponent(m[2])}.png?size=64`
}

async function sha256(text: string): Promise<string> {
  const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(data)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function resolve(email: string): Promise<string | null> {
  const key = email.trim().toLowerCase()
  if (urlCache.has(key)) return Promise.resolve(urlCache.get(key)!)
  let p = pending.get(key)
  if (!p) {
    p = (async () => {
      if (!key.includes('@')) return null
      const url = githubNoreply(key) ?? `https://www.gravatar.com/avatar/${await sha256(key)}?s=64&d=404`
      urlCache.set(key, url)
      pending.delete(key)
      return url
    })()
    pending.set(key, p)
  }
  return p
}

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}

function hue(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h % 360
}

export function Avatar({ email, name, enabled }: { email: string; name: string; enabled: boolean }): React.JSX.Element {
  const key = email.trim().toLowerCase()
  const [url, setUrl] = useState<string | null>(() => (enabled ? urlCache.get(key) ?? null : null))
  const [broken, setBroken] = useState(() => failed.has(key))

  useEffect(() => {
    if (!enabled) {
      setUrl(null)
      return
    }
    let cancelled = false
    setBroken(failed.has(key))
    resolve(key).then((u) => !cancelled && setUrl(u))
    return () => {
      cancelled = true
    }
  }, [key, enabled])

  if (enabled && url && !broken) {
    return (
      <img
        src={url}
        alt=""
        draggable={false}
        referrerPolicy="no-referrer"
        onError={() => {
          failed.add(key)
          setBroken(true)
        }}
      />
    )
  }
  return (
    <span className="avatar-initials" style={{ background: `hsl(${hue(key || name)} 42% 42%)` }}>
      {initials(name)}
    </span>
  )
}
