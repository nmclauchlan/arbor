import { useEffect, useRef } from 'react'

export interface Command {
  id: string
  group: string
  title: string
  shortcut?: string
  run: () => void
}

const providers = new Map<string, () => Command[]>()

export function useCommands(id: string, enabled: boolean, provide: () => Command[]): void {
  const latest = useRef(provide)
  latest.current = provide
  useEffect(() => {
    if (!enabled) return
    providers.set(id, () => latest.current())
    return () => {
      providers.delete(id)
    }
  }, [id, enabled])
}

export function collectCommands(): Command[] {
  return [...providers.values()].flatMap((p) => p())
}
