import { useMemo, useState } from 'react'
import type { StatusFile } from '@shared/types'
import { setFileView, useFileView } from '../fileView'

export function FileRow({
  file,
  selected,
  onClick,
  onDoubleClick,
  depth = 0,
  label,
  children
}: {
  file: StatusFile
  selected: boolean
  onClick: () => void
  onDoubleClick?: () => void
  depth?: number
  label?: string
  children?: React.ReactNode
}): React.JSX.Element {
  const full = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path
  return (
    <div
      className={`file-item${selected ? ' selected' : ''}`}
      style={{ paddingLeft: 12 + depth * 14 }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={full}
    >
      <span className={`status-letter ${file.status}`}>{file.status}</span>
      <span className="path"><span>{label ?? full}</span></span>
      {children}
    </div>
  )
}

export function FileViewToggle(): React.JSX.Element {
  const view = useFileView()
  return (
    <span className="view-toggle" title="Switch between tree and flat file lists">
      <button className={view === 'tree' ? 'active' : ''} onClick={() => setFileView('tree')}>
        Tree
      </button>
      <button className={view === 'flat' ? 'active' : ''} onClick={() => setFileView('flat')}>
        Flat
      </button>
    </span>
  )
}

interface DirNode {
  name: string
  path: string
  dirs: Map<string, DirNode>
  files: StatusFile[]
}

function buildTree(files: StatusFile[]): DirNode {
  const root: DirNode = { name: '', path: '', dirs: new Map(), files: [] }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i]
      let next = node.dirs.get(name)
      if (!next) {
        next = { name, path: node.path ? `${node.path}/${name}` : name, dirs: new Map(), files: [] }
        node.dirs.set(name, next)
      }
      node = next
    }
    node.files.push(f)
  }
  return root
}

function compact(node: DirNode): DirNode {
  let n = node
  while (n.dirs.size === 1 && n.files.length === 0) {
    const [child] = n.dirs.values()
    n = { ...child, name: n.name ? `${n.name}/${child.name}` : child.name }
  }
  return { ...n, dirs: new Map([...n.dirs].map(([k, v]) => [k, compact(v)])) }
}

function sortedDirs(node: DirNode): DirNode[] {
  return [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function sortedFiles(node: DirNode): StatusFile[] {
  return [...node.files].sort((a, b) => a.path.localeCompare(b.path))
}

export function FileList({
  files,
  selectedPath,
  onSelect,
  onDoubleClick,
  actions
}: {
  files: StatusFile[]
  selectedPath: string | null
  onSelect: (f: StatusFile) => void
  onDoubleClick?: (f: StatusFile) => void
  actions?: (f: StatusFile) => React.ReactNode
}): React.JSX.Element {
  const view = useFileView()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const tree = useMemo(() => (view === 'tree' ? compact(buildTree(files)) : null), [files, view])

  const toggle = (path: string): void => {
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  if (view === 'flat' || !tree) {
    return (
      <>
        {files.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            selected={selectedPath === f.path}
            onClick={() => onSelect(f)}
            onDoubleClick={onDoubleClick ? () => onDoubleClick(f) : undefined}
          >
            {actions?.(f)}
          </FileRow>
        ))}
      </>
    )
  }

  const renderDir = (node: DirNode, depth: number): React.ReactNode => {
    const rows: React.ReactNode[] = []
    for (const dir of sortedDirs(node)) {
      const open = !collapsed.has(dir.path)
      rows.push(
        <div
          key={'d:' + dir.path}
          className="dir-item"
          style={{ paddingLeft: 12 + depth * 14 }}
          onClick={() => toggle(dir.path)}
          title={dir.path}
        >
          <span className="chevron">{open ? '▾' : '▸'}</span>
          <span className="folder">▭</span>
          <span className="name">{dir.name}</span>
        </div>
      )
      if (open) rows.push(renderDir(dir, depth + 1))
    }
    for (const f of sortedFiles(node)) {
      const name = f.path.slice(f.path.lastIndexOf('/') + 1)
      rows.push(
        <FileRow
          key={f.path}
          file={f}
          depth={depth}
          label={f.oldPath ? `${f.oldPath.slice(f.oldPath.lastIndexOf('/') + 1)} → ${name}` : name}
          selected={selectedPath === f.path}
          onClick={() => onSelect(f)}
          onDoubleClick={onDoubleClick ? () => onDoubleClick(f) : undefined}
        >
          {actions?.(f)}
        </FileRow>
      )
    }
    return rows
  }

  return <>{renderDir(tree, 0)}</>
}
