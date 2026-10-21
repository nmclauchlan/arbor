import { useCallback, useEffect, useState } from 'react'

type DialogState =
  | { kind: 'prompt'; title: string; label: string; value: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; message: string; danger: boolean; resolve: (ok: boolean) => void }

export interface Dialogs {
  prompt(title: string, label: string, defaultValue?: string): Promise<string | null>
  confirm(title: string, message: string, danger?: boolean): Promise<boolean>
  element: React.JSX.Element | null
}

export function useDialogs(): Dialogs {
  const [state, setState] = useState<DialogState | null>(null)

  const prompt = useCallback(
    (title: string, label: string, defaultValue = '') =>
      new Promise<string | null>((resolve) => setState({ kind: 'prompt', title, label, value: defaultValue, resolve })),
    []
  )
  const confirm = useCallback(
    (title: string, message: string, danger = false) =>
      new Promise<boolean>((resolve) => setState({ kind: 'confirm', title, message, danger, resolve })),
    []
  )

  const close = (): void => setState(null)

  const element = state ? <DialogView state={state} close={close} setState={setState} /> : null
  return { prompt, confirm, element }
}

function DialogView({
  state,
  close,
  setState
}: {
  state: DialogState
  close: () => void
  setState: (s: DialogState) => void
}): React.JSX.Element {
  const cancel = (): void => {
    if (state.kind === 'prompt') state.resolve(null)
    else state.resolve(false)
    close()
  }
  const ok = (): void => {
    if (state.kind === 'prompt') {
      if (!state.value.trim()) return
      state.resolve(state.value.trim())
    } else state.resolve(true)
    close()
  }

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancel()
      if (e.key === 'Enter') ok()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  return (
    <div className="overlay" onMouseDown={cancel}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{state.title}</h3>
        {state.kind === 'prompt' ? (
          <>
            <p>{state.label}</p>
            <input
              autoFocus
              value={state.value}
              onChange={(e) => setState({ ...state, value: e.target.value })}
            />
          </>
        ) : (
          <p>{state.message}</p>
        )}
        <div className="buttons">
          <button onClick={cancel}>Cancel</button>
          <button className={state.kind === 'confirm' && state.danger ? 'danger' : 'primary'} onClick={ok}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
