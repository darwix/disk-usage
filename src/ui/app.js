const D = window.DATA;
const gb = (b) => (b / 1e9 >= 100 ? Math.round(b / 1e9) : (b / 1e9).toFixed(1)) + " GB";
const esc = (s) => s.replace(/[&<>"]/g, (c) => "&#" + c.charCodeAt(0) + ";");
const rel = (p) => "~" + p.slice(D.root.length).replace(/\\/g, "/");
const sel = new Set(D.rec.map((r, i) => (r.group === "safe" ? i : -1)).filter((i) => i >= 0));
const targets = new Set(D.rec.flatMap((r) => r.paths));
let mode = "cat", stack = [D.tree];

function stats() {
  const tot = (g) => D.rec.filter((r) => r.group === g).reduce((s, r) => s + r.size, 0);
  const cnt = (g) => D.rec.filter((r) => r.group === g).length;
  const picked = [...sel].reduce((s, i) => s + D.rec[i].size, 0);
  const [n, u] = gb(D.disk.free + picked).split(" ");
  free.innerHTML = `${n} ${u} <small class="up">+${gb(picked)}</small>`;
  safe.innerHTML = `${gb(tot("safe"))} <small>${cnt("safe")} items</small>`;
  review.innerHTML = `${gb(tot("review"))} <small>${cnt("review")} items</small>`;
  other.innerHTML = `${gb(Math.max(0, D.disk.total - D.disk.free - D.tree.size))} <small>system &amp; apps</small>`;
  selsize.textContent = gb(picked);
  selcount.textContent = sel.size === 1 ? "1 item" : `${sel.size} items`;
}

function tile(node, r, level, parent) {
  const el = document.createElement("div");
  el.className = `tile l${level} c-${node.cat}` + (targets.has(node.path) ? " hatch" : "");
  Object.assign(el.style, { left: r.x + "px", top: r.y + "px", width: Math.max(0, r.w) + "px", height: Math.max(0, r.h) + "px" });
  el.title = `${rel(node.path)} — ${gb(node.size)}`;
  if (r.w > 40 && r.h > 22) el.innerHTML = `<div class="n">${esc(node.name)}</div>`;
  if (level === 1 && r.w > 110) el.innerHTML += `<div class="s">${gb(node.size)}</div>`;
  el.onclick = (e) => { e.stopPropagation(); if (node !== stack.at(-1)) { stack.push(node); draw(); } };
  parent.appendChild(el);
  const pad = level === 1 ? 4 : 3, top = r.h > 40 ? (level === 1 ? 22 : 20) : pad;
  if (node.children && level < 3 && r.w > 30 && r.h > 40) {
    for (const c of squarify(node.children, pad, top, r.w - pad * 2 - 2, r.h - top - pad - 2))
      tile(c.item, { x: c.x + 1, y: c.y + 1, w: c.w - 3, h: c.h - 3 }, level + 1, el);
  } else if (level > 1 && r.w > 60 && r.h > 44) {
    el.innerHTML += `<div class="big" style="font-size:${r.w > 140 && r.h > 120 ? 16 : 12}px">${gb(node.size)}</div>`;
  }
}

let noteT;
async function reveal(node) {
  const r = await fetch("/reveal", { method: "POST", body: node.path }).catch(() => ({}));
  note.textContent = r.ok ? `Opened ${node.name} in Explorer`
    : r.status === 410 ? `${node.name} no longer exists. It was moved or deleted; rescan to refresh.`
    : "Couldn't open that folder. Try rescanning.";
  note.classList.toggle("err", !r.ok);
  note.classList.add("on");
  clearTimeout(noteT);
  noteT = setTimeout(() => note.classList.remove("on"), 3000);
}

function draw() {
  const cur = stack.at(-1);
  map.innerHTML = "";
  map.className = mode === "clean" ? "dim" : "";
  const W = map.clientWidth, H = map.clientHeight;
  const kids = cur.children || [cur];
  for (const c of squarify(kids, 0, 0, W, H)) tile(c.item, { x: c.x + 2, y: c.y + 2, w: c.w - 4, h: c.h - 4 }, 1, map);
  crumbs.innerHTML = stack.map((n, i) => `<a data-i="${i}">${i ? esc(n.name) : "~ Home"}</a>`).join(" / ");
  rootsize.textContent = gb(cur.size);
  openbtn.textContent = `Open ${stack.length > 1 ? cur.name : "Home"} in Explorer`;
}
crumbs.onclick = (e) => { if (e.target.dataset.i) { stack.length = +e.target.dataset.i + 1; draw(); } };

function list() {
  let html = "", last;
  D.rec.forEach((r, i) => {
    if (r.group !== last) {
      last = r.group;
      const tot = D.rec.filter((x) => x.group === r.group).reduce((s, x) => s + x.size, 0);
      html += `<div class="grp"><span class="flag ${r.group}">${r.group === "safe" ? "Safe to remove" : "Check before deleting"}</span>${gb(tot)}</div>`;
    }
    const shown = r.paths.length > 2 ? `${r.paths.length} folders` : r.paths.map(rel).join(", ");
    html += `<div class="item" data-i="${i}"><input type="checkbox" ${sel.has(i) ? "checked" : ""}>
      <div><div class="t">${esc(r.label)}</div><div class="p">${esc(shown)}</div></div>
      <div class="z">${gb(r.size)}</div><div class="ch">›</div></div>
      <div class="paths">${r.paths.map((p) => esc(p)).join("<br>")}</div>`;
  });
  window.list_el = document.getElementById("list");
  list_el.innerHTML = html || `<div class="empty">No caches or build folders over 50 MB found.</div>`;
}
document.getElementById("list").onclick = (e) => {
  const it = e.target.closest(".item"); if (!it) return;
  const i = +it.dataset.i;
  if (e.target.tagName === "INPUT") { e.target.checked ? sel.add(i) : sel.delete(i); stats(); }
  else it.classList.toggle("open");
};
selsafe.onclick = () => { sel.clear(); D.rec.forEach((r, i) => r.group === "safe" && sel.add(i)); list(); stats(); };
const del = document.getElementById("del"), msg = document.getElementById("msg");
let armed = null;
const disarm = () => { clearTimeout(armed); armed = null; del.classList.remove("armed"); del.textContent = "Delete"; };
del.onclick = async () => {
  if (!sel.size) return (msg.textContent = "Tick at least one item.");
  if (!armed) {
    del.classList.add("armed");
    del.textContent = `Delete ${gb([...sel].reduce((s, i) => s + D.rec[i].size, 0))}?`;
    msg.textContent = "Click again to delete permanently. This skips the Recycle Bin.";
    armed = setTimeout(() => { disarm(); msg.textContent = ""; }, 5000);
    return;
  }
  disarm();
  del.disabled = true; del.textContent = "Deleting…"; msg.textContent = "";
  try {
    const r = await (await fetch("/delete", { method: "POST", body: JSON.stringify({ labels: [...sel].map((i) => D.rec[i].label) }) })).json();
    if (r.error) throw new Error(r.error);
    if (r.failed.length) {
      del.disabled = false; del.textContent = "Delete";
      msg.textContent = `Freed ${gb(r.freed)}. ${r.failed.length} folder(s) were in use and couldn't be removed; close the apps using them and try again.`;
    } else location.reload();
  } catch (e) {
    del.disabled = false; del.textContent = "Delete";
    msg.textContent = `Couldn't delete: ${e.message}`;
  }
};
document.querySelector(".seg").onclick = (e) => {
  if (!e.target.dataset.m) return;
  mode = e.target.dataset.m;
  document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b === e.target));
  draw();
};
addEventListener("resize", draw);
openbtn.onclick = () => reveal(stack.at(-1));
rootname.textContent = D.root;
document.getElementById("when").textContent = "Scanned " + new Date(D.scannedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const rescanBtn = document.getElementById("rescan");
async function poll() {
  const s = await (await fetch("/status")).json();
  if (!s.running) return location.reload();
  rescanBtn.disabled = true;
  rescanBtn.textContent = `Scanning… ${s.scanned.toLocaleString()} folders`;
  setTimeout(poll, 1500);
}
if (location.protocol === "file:") {
  del.disabled = true;
  del.title = "Open the app (or node scan.js --serve) to delete from here";
  openbtn.hidden = true;
  rescanBtn.disabled = true;
  rescanBtn.title = "Run node scan.js --serve and open http://localhost:4321 to rescan from here";
} else {
  rescanBtn.onclick = async () => { await fetch("/rescan", { method: "POST" }); poll(); };
  fetch("/status").then((r) => r.json()).then((s) => s.running && poll()).catch(() => {});
  addEventListener("pagehide", () => navigator.sendBeacon("/quit")); // closing the window quits the exe
}
stats(); list(); draw();
