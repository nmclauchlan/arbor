import { app, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sizes = [512]

app.whenReady().then(async () => {
  const svg = await readFile(join(root, 'build/icon.svg'), 'utf8')
  for (const size of sizes) {
    const win = new BrowserWindow({ width: size, height: size, show: false, transparent: true, frame: false })
    const html = `<html><body style="margin:0;background:transparent">${svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body></html>`
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    await new Promise((r) => setTimeout(r, 300))
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
    const name = size === 512 ? 'icon.png' : `icon-${size}.png`
    await writeFile(join(root, 'build', name), image.toPNG())
    win.destroy()
  }
  app.quit()
})
