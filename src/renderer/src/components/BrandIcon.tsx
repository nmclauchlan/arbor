import { useId, useMemo } from 'react'
import iconSvg from '../../../../build/icon.svg?raw'

export function BrandIcon({
  size = 24,
  animated = false
}: {
  size?: number
  animated?: boolean
}): React.JSX.Element {
  const id = useId()
  // Share the native icon's source, with unique gradient IDs for each inline instance.
  const markup = useMemo(() => iconSvg.replaceAll('arbor-', `arbor-${id}-`), [id])

  return (
    <span
      className={`brand-icon${animated ? ' brand-icon--animated' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
