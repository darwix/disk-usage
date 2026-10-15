// Squarified treemap. items need .size, sorted desc. Returns [{item,x,y,w,h}].
function squarify(items, x, y, w, h) {
  const out = [];
  const total = items.reduce((s, i) => s + i.size, 0);
  if (!total || w <= 0 || h <= 0) return out;
  const scale = (w * h) / total;
  let rest = items.filter((i) => i.size > 0).map((i) => ({ item: i, a: i.size * scale }));
  while (rest.length) {
    const side = Math.min(w, h);
    const worst = (r) => {
      const s = r.reduce((t, c) => t + c.a, 0);
      const mx = Math.max(...r.map((c) => c.a));
      const mn = Math.min(...r.map((c) => c.a));
      return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
    };
    let row = [rest[0]];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]]) <= worst(row)) row.push(rest[i++]);
    rest = rest.slice(i);
    const s = row.reduce((t, c) => t + c.a, 0);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      for (const c of row) {
        out.push({ item: c.item, x, y: cy, w: cw, h: c.a / cw });
        cy += c.a / cw;
      }
      x += cw;
      w -= cw;
    } else {
      const ch = s / w;
      let cx = x;
      for (const c of row) {
        out.push({ item: c.item, x: cx, y, w: c.a / ch, h: ch });
        cx += c.a / ch;
      }
      y += ch;
      h -= ch;
    }
  }
  return out;
}
if (typeof module !== "undefined") module.exports = { squarify };
