# Disk Usage

See what's filling your Windows home folder and clear dev caches safely.

Scans your home folder, draws a treemap of the biggest folders, and lists things that are usually safe to remove (npm/pip/Gradle caches, Temp, build output) separately from things worth a second look (Android SDK, Ollama models, `node_modules` in idle projects).

## Use

Download `DiskUsage.exe` from the [latest release](../../releases/latest) and double-click it. It opens in its own window; closing the window quits the app.

- **Map**: click a folder to zoom in, use the path bar to go back. **Open … in Explorer** opens the folder you're viewing.
- **Clean up**: tick items and press **Delete** twice to confirm. Deletes are permanent (they skip the Recycle Bin).
- **Rescan** refreshes everything. Scan data is kept in `%LOCALAPPDATA%\DiskUsage`.

The app only listens on `127.0.0.1`, and it only deletes or opens paths that came from its own scan.

## Develop

Requires Node 22+.

```sh
npm start        # serve on http://localhost:4321 (writes to out/)
npm test
npm run build    # dist/DiskUsage.exe via Node single executable applications
node src/scan.js D:\some\folder   # scan another folder, writes out/report.html
```

To release: `git tag v1.2.3 && git push origin v1.2.3`. CI builds the exe and attaches it to a GitHub Release.

```
src/scan.js        scanner, recommendations, local server
src/treemap.js     squarified treemap (shared by Node and the page)
src/ui/            template.html, style.css, app.js, inlined into one report.html
test/              treemap tests
assets/icon.ico    app icon
```

`npm run build` copies `node.exe`, switches it to a windowed app, sets the icon, and injects the app with `postject`. Close the app first or Windows will block the build.
