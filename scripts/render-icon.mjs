import { app, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { setTimeout as delay } from 'timers/promises'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sizes = [512]

app.commandLine.appendSwitch('force-device-scale-factor', '1')

async function captureIcon(contents, size) {
  // A hidden window's compositor can lag behind did-finish-load on Windows.
  for (let attempt = 0; attempt < 5; attempt++) {
    await delay(200)
    try {
      return await contents.capturePage({ x: 0, y: 0, width: size, height: size })
    } catch (error) {
      if (attempt === 4 || !String(error).includes('UnknownVizError')) throw error
    }
  }
}

async function renderIcons() {
  const svg = await readFile(join(root, 'build/icon.svg'), 'utf8')
  for (const size of sizes) {
    const win = new BrowserWindow({
      width: size,
      height: size,
      useContentSize: true,
      show: false,
      transparent: true,
      frame: false,
      webPreferences: {
        backgroundThrottling: false,
        zoomFactor: 1,
        sandbox: true,
        contextIsolation: true
      }
    })
    try {
      const html = `<!doctype html><html><head><style>
        html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
        svg { display: block; width: 100%; height: 100%; }
      </style></head><body>${svg}</body></html>`
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
      const captured = await captureIcon(win.webContents, size)
      if (captured.isEmpty()) throw new Error(`Empty icon capture at ${size}px`)
      // Keep physical PNG dimensions exact even if platform display scaling changes.
      const image = captured.resize({ width: size, height: size, quality: 'best' })
      const name = size === 512 ? 'icon.png' : `icon-${size}.png`
      await writeFile(join(root, 'build', name), image.toPNG())
      console.log(`Rendered build/${name} (${size} × ${size})`)
    } finally {
      if (!win.isDestroyed()) win.destroy()
    }
  }
}

function finish(exitCode) {
  clearTimeout(timeout)
  if (app.isReady()) {
    for (const win of BrowserWindow.getAllWindows()) win.destroy()
  }
  app.exit(exitCode)
}

const timeout = setTimeout(() => {
  console.error('Unable to render icon: timed out after 30 seconds')
  finish(1)
}, 30000)

// Electron must finish evaluating this entry module before it emits ready.
app.whenReady()
  .then(renderIcons)
  .then(() => finish(0))
  .catch((error) => {
    console.error('Unable to render icon:', error)
    finish(1)
  })
