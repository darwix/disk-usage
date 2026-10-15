// Scans home folder, writes data.json + report.html. Usage: node scan.js [folder] | node scan.js --html
const fs = require("fs");
const path = require("path");
const os = require("os");

// Packaged as DiskUsage.exe (Node SEA): assets come from the exe, data goes to %LOCALAPPDATA%DiskUsage
let sea;
try { sea = require("node:sea"); } catch {}
const PACKED = !!sea?.isSea();
const asset = (f) => (PACKED ? sea.getAsset(f, "utf8") : fs.readFileSync(path.join(__dirname, f), "utf8"));
const OUT = PACKED ? path.join(process.env.LOCALAPPDATA || os.homedir(), "DiskUsage") : path.join(__dirname, "..", "out");
fs.mkdirSync(OUT, { recursive: true });
const DATA = path.join(OUT, "data.json");
const lastScan = () => JSON.parse(fs.readFileSync(DATA, "utf8"));
const body = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)).on("end", () => r(b)); });

const arg = process.argv[2] || "";
const ROOT = path.resolve(arg.startsWith("--") ? os.homedir() : arg || os.homedir());
const KEEP_DEPTH = 4; // tree depth kept for the treemap
const MIN_NODE = 20e6; // smaller folders folded into parent
const IDLE_MS = 30 * 864e5;

// ponytail: global fd limiter, avoids EMFILE on big trees
let active = 0;
const queue = [];
const limit = (fn) =>
  new Promise((res, rej) => {
    const run = () => {
      active++;
      fn()
        .then(res, rej)
        .finally(() => {
          active--;
          if (queue.length) queue.shift()();
        });
    };
    active < 64 ? run() : queue.push(run);
  });

const CATS = [
  [/ollama|huggingface|lmstudio|[\\/]models/i, "ai"],
  [/android|\.gradle|xcode|sdk/i, "sdk"],
  [/npm-cache|yarn|pnpm|\.cache|[\\/]pip|[\\/]uv|nuget|\.m2|go[\\/]pkg|cargo/i, "pkg"],
  [/[\\/](git|projects|repos|src|code|desktop)([\\/]|$)/i, "code"],
  [/documents|pictures|downloads|music|videos|onedrive/i, "docs"],
];
const catOf = (rel) => (CATS.find(([re]) => re.test(rel)) || [0, "dev"])[1];

let dirSizes, found, scanned;

async function scan(p, depth) {
  scanned++;
  const node = { name: path.basename(p) || p, path: p, size: 0 };
  let entries;
  try {
    entries = await limit(() => fs.promises.readdir(p, { withFileTypes: true }));
  } catch {
    return node;
  }
  const kids = [];
  await Promise.all(
    entries.map(async (e) => {
      if (e.isSymbolicLink()) return; // junctions too
      const full = path.join(p, e.name);
      if (e.isDirectory()) {
        const c = await scan(full, depth + 1);
        node.size += c.size;
        kids.push(c);
        if (!/node_modules/.test(p)) {
          if (e.name === ".next" || e.name === ".turbo") found.build.push(full);
          if (e.name === "node_modules") found.modules.push(full);
        }
      } else {
        try {
          node.size += (await limit(() => fs.promises.lstat(full))).size;
        } catch {}
      }
    }),
  );
  if (node.size > 1e6) dirSizes.set(p, node.size);
  if (depth < KEEP_DEPTH) {
    const big = kids.filter((k) => k.size >= MIN_NODE).sort((a, b) => b.size - a.size);
    if (big.length) node.children = big;
  }
  node.cat = catOf(path.relative(ROOT, p) || "");
  return node;
}

const RULES = [
  ["safe", "npm cache", ["AppData/Local/npm-cache", ".npm"]],
  ["safe", "Yarn & pnpm caches", ["AppData/Local/Yarn/Cache", "AppData/Local/pnpm/store", "AppData/Local/pnpm-cache"]],
  ["safe", "pip & uv caches", ["AppData/Local/pip/cache", "AppData/Local/uv/cache"]],
  ["safe", "Puppeteer & tool caches", [".cache/puppeteer", ".cache/ms-playwright", "AppData/Local/ms-playwright"]],
  ["safe", "Gradle caches", [".gradle/caches"]],
  ["safe", "Temp files", ["AppData/Local/Temp"]],
  ["review", "Android SDK & emulators", ["AppData/Local/Android/Sdk", ".android/avd"]],
  ["review", "Ollama models", [".ollama/models"]],
  ["review", "Hugging Face models", [".cache/huggingface"]],
  ["review", "Docker data", ["AppData/Local/Docker"]],
];

async function main() {
  const t0 = Date.now();
  dirSizes = new Map();
  found = { build: [], modules: [] };
  scanned = 0;
  console.log("Scanning", ROOT, "...");
  const tree = await scan(ROOT, 0);
  const rec = [];
  for (const [group, label, rels] of RULES) {
    const paths = rels.map((r) => path.join(ROOT, r)).filter((p) => dirSizes.has(p));
    const size = paths.reduce((s, p) => s + dirSizes.get(p), 0);
    if (size > 50e6) rec.push({ group, label, paths, size });
  }
  const sum = (ps) => ps.reduce((s, p) => s + (dirSizes.get(p) || 0), 0);
  if (sum(found.build) > 50e6)
    rec.push({ group: "safe", label: "Next.js & Turbo build output", paths: found.build, size: sum(found.build) });
  const idle = found.modules.filter((m) => {
    try {
      return Date.now() - fs.statSync(path.dirname(m)).mtimeMs > IDLE_MS;
    } catch {
      return false;
    }
  });
  if (sum(idle) > 50e6)
    rec.push({ group: "review", label: "node_modules in idle projects", paths: idle, size: sum(idle) });
  rec.sort((a, b) => (a.group === b.group ? b.size - a.size : a.group === "safe" ? -1 : 1));

  const disk = await fs.promises.statfs(ROOT);
  const data = {
    root: ROOT,
    tree,
    rec,
    disk: { total: disk.blocks * disk.bsize, free: disk.bavail * disk.bsize },
    scannedAt: new Date().toISOString(),
  };
  fs.writeFileSync(DATA, JSON.stringify(data));
  render(data);
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function render(data) {
  const html = asset("ui/template.html")
    .replace("/*CSS*/", () => asset("ui/style.css"))
    .replace("/*TREEMAP*/", () => asset("treemap.js"))
    .replace("/*APP*/", () => asset("ui/app.js"))
    .replace("/*DATA*/", () => "window.DATA = " + JSON.stringify(data).replace(/</g, "\\u003c") + ";");
  const out = path.join(OUT, "report.html");
  fs.writeFileSync(out, html);
  console.log("Wrote", out);
}

// --serve: http://localhost:4321 with a working Rescan button
function serve() {
  let running = null;
  let seen = Date.now();
  require("http")
    .createServer(async (req, res) => {
      seen = Date.now();
      if (req.method === "POST" && req.url === "/rescan") {
        running ||= main().finally(() => (running = null));
        return res.end("ok");
      }
      if (req.method === "POST" && req.url === "/delete") {
        res.setHeader("content-type", "application/json");
        if (running) return res.end(JSON.stringify({ error: "Scan in progress" }));
        try {
          return res.end(JSON.stringify(remove(JSON.parse(await body(req)).labels)));
        } catch (e) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: String(e.message) }));
        }
      }
      if (req.method === "POST" && req.url === "/reveal") {
        const p = await body(req);
        // only folders from the last scan, never an arbitrary path from the request
        const has = (n) => n.path === p || (n.children || []).some(has);
        // explorer silently opens Documents for a missing folder, so check first
        if (!has(lastScan().tree)) res.statusCode = 404;
        else if (!fs.existsSync(p)) res.statusCode = 410;
        else require("child_process").execFile("explorer.exe", [p]);
        return res.end();
      }
      // window closed (X): exit unless a page reconnects within 3s (reloads also fire this). Exe only.
      if (req.method === "POST" && req.url === "/quit") {
        const t = seen;
        if (PACKED) setTimeout(() => seen === t && !running && process.exit(), 3000);
        return res.end();
      }
      if (req.url === "/status") {
        res.setHeader("content-type", "application/json");
        return res.end(JSON.stringify({ running: !!running, scanned }));
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      fs.createReadStream(path.join(OUT, "report.html")).on("error", () => res.end(FIRST_RUN)).pipe(res);
    })
    .on("error", openWindow) // already running: just open another window
    .listen(4321, "127.0.0.1", () => {
      console.log("Open http://localhost:4321");
      // re-render from the last scan so a new build's UI shows without rescanning
      if (fs.existsSync(DATA)) render(lastScan());
      else running = main().finally(() => (running = null));
      if (PACKED) openWindow();
    });
}

// Deletes recommended items by label. Paths come only from data.json, never from the request.
function remove(labels) {
  const data = lastScan();
  let freed = 0;
  const failed = [];
  for (const r of data.rec.filter((r) => labels.includes(r.label))) {
    for (const p of r.paths) {
      // locked files (e.g. in Temp) fail individually; keep going
      try {
        fs.rmSync(p, { recursive: true, force: true, maxRetries: 2 });
      } catch {
        failed.push(p);
      }
    }
    const left = r.paths.filter((p) => fs.existsSync(p));
    if (!left.length) {
      freed += r.size;
      data.rec = data.rec.filter((x) => x !== r);
    }
  }
  data.disk.free += freed; // ponytail: estimate until next rescan; tree sizes stay stale too
  fs.writeFileSync(DATA, JSON.stringify(data));
  render(data);
  return { freed, failed };
}

// Edge app mode = chromeless window; falls back to default browser
function openWindow() {
  const { exec } = require("child_process");
  const opts = { windowsHide: true };
  exec('start "" msedge --app=http://localhost:4321 --window-size=1480,1000', opts, (err) => err && exec('start "" http://localhost:4321', opts));
}

const FIRST_RUN = `<!doctype html><meta charset="utf-8"><title>Disk Usage</title>
<body style="font:14px Segoe UI,sans-serif;background:#f3f3f1;color:#1b1b19;display:grid;place-items:center;height:100vh;margin:0">
<div><b>Scanning your home folder for the first time</b><p id="s" style="color:#85847d">Starting…</p></div>
<script>(async function p(){const s=await(await fetch("/status")).json();if(!s.running)return location.reload();
document.getElementById("s").textContent=s.scanned.toLocaleString()+" folders so far. This can take a while.";setTimeout(p,1500)})()</script>`;

// --html: rebuild report.html from the last scan's data.json, no rescan
if (arg === "--html") render(lastScan());
else if (arg === "--serve" || PACKED) serve();
else main();
