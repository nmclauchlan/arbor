# Arbor

A GitKraken-style desktop git client built with Electron, React and TypeScript. Branches grow in lanes; Arbor keeps them in order.

## Features

- Commit graph with coloured lanes, merge curves and ref badges (branches, remotes, tags, HEAD)
- Working tree panel: stage/unstage/discard files, view diffs, commit and amend (Ctrl+Enter)
- Commit details with changed-file list and unified diff viewer
- Sidebar with local branches (ahead/behind), remote branches, tags and stashes
- Toolbar actions: fetch, pull, push (sets upstream when missing), create branch, stash, pop
- Context menus: checkout, merge, create branch here, delete branch, cherry-pick, revert, reset (soft/mixed/hard), copy SHA
- Recent repositories on the welcome screen
- Live refresh of status and refs every few seconds and on window focus

## Development

```bash
npm install
npm run dev
```

Pass a repository path to open it on launch:

```bash
npx electron . C:\path\to\repo
```

Other scripts:

- `npm run typecheck` runs the TypeScript checks for the main, preload and renderer projects
- `npm run build` produces `out/`
- `npm run dist` builds a Windows installer into `release/`

## Layout

- `src/main` Electron main process. `git.ts` wraps the git CLI via simple-git; `index.ts` creates the window and exposes each git function over IPC as `git:<name>`.
- `src/preload` bridges those IPC channels to `window.git` in the renderer.
- `src/shared/types.ts` types shared by both sides, including the `GitApi` contract.
- `src/renderer/src` React UI. `graph/layout.ts` assigns lanes and edges for the commit graph; `components/` holds the panels.
