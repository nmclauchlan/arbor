<p align="center">
  <img src="build/icon.png" width="128" height="128" alt="Arbor icon">
</p>

<h1 align="center">Arbor</h1>

<p align="center">A desktop git client for Windows, macOS and Linux. Branches grow in lanes; Arbor keeps them in order.</p>

![Arbor showing a commit graph with a merge commit selected](docs/screenshot.png)

## Download

Grab the installer for your platform from the [releases page](https://github.com/nmclauchlan/arbor/releases). Arbor checks for new versions itself and offers to restart into them from the status bar.

## What you get

**The graph.** Every branch, remote, tag and stash on one commit graph with coloured lanes and merge curves. Click a commit to see its files; right-click for checkout, branch, cherry-pick, revert, reset and more.

**Working with changes.** Stage, unstage and discard per file, per folder or all at once, and jump to any file or folder in Explorer or Finder. Click any file to see its diff in the main view, double-click to edit it in place with syntax highlighting, and commit with Ctrl+Enter. Changed images get side-by-side, swipe, onion-skin and difference comparisons.

**Merge conflicts.** When a merge, cherry-pick, revert or rebase stops on conflicts, the changes panel lists them with one-click ours/theirs, and opening a file shows each conflict side by side with Use ours, Use theirs or Use both and an editable result. Abort or continue from the same banner.

**Several repositories at once.** Each repository opens in a tab. Drag tabs to reorder them, or collect them into named colour-coded groups that open as a dropdown list. Open several repositories at once from the file dialog, drag a tab onto a group to file it, or use the + button to open, clone or start a new group. Everything is back where you left it next launch.

**Finding your way.** Filter branches with Ctrl+B. View changed files as a folder tree or a flat list. Resize the sidebar, panels and the graph's columns to taste.

**Looks and settings.** Ten themes, dark and light, including Dracula, Nord, Solarized, Gruvbox, Monokai and Rosé Pine; the editor follows the theme. Settings (⚙ or Ctrl+,) cover the theme, the default file-list view, how often repositories refresh, how much history to load, which git executable to use, and automatic update checks.

**GitHub, GitLab and Azure DevOps.** Connect an account with a personal access token under Settings → Accounts; self-hosted GitHub Enterprise and GitLab instances work alongside github.com and gitlab.com. Open pull and merge requests then appear in the sidebar and as badges on their branches, each with reviewers and approvals, checks and pipeline jobs, merge state, and a link to open in the browser. Create one for the current branch straight from the toolbar, or clone any repository you have access to from a searchable list under + → Clone.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+O | Open a repository |
| Ctrl+, | Settings |
| Ctrl+W | Close the current tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab |
| Ctrl+B | Filter branches |
| Ctrl+Enter | Commit |
| Ctrl+S | Save the file being edited |
| Esc | Back to the graph |

## Building from source

Arbor is built with Electron, React and TypeScript, and drives the `git` on your PATH.

```bash
npm install
npm run dev
```

Pass a repository path to open it on launch:

```bash
npx electron . C:\path\to\repo
```

- `npm run typecheck` runs the TypeScript checks for the main, preload and renderer projects
- `npm run build` produces `out/`
- `npm run dist` builds installers for the current platform into `release/`
- `npm run icon` re-renders `build/icon.svg` to `build/icon.png`

### Layout

- `src/main` Electron main process. `git.ts` wraps the git CLI; `index.ts` creates the window and exposes each git function over IPC; `updater.ts` handles updates.
- `src/preload` bridges those IPC channels to `window.git`, `window.updater` and `window.native`.
- `src/shared/types.ts` types shared by both sides, including the `GitApi` contract.
- `src/renderer/src` React UI. `graph/layout.ts` lays out the commit graph; `components/` holds the panels, the file viewer, the editor and the tab bar.
