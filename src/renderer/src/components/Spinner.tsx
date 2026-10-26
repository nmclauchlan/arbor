export function Spinner({ label }: { label?: string }): React.JSX.Element {
  return <span className="spinner" role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
}

export function Loading({ label = 'Loading…', className = 'center' }: { label?: string; className?: string }): React.JSX.Element {
  return (
    <div className={`${className} loading`} role="status">
      <Spinner />
      <span>{label}</span>
    </div>
  )
}
