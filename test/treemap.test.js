const assert = require("assert");
const { squarify } = require("../src/treemap.js");

const items = [50, 20, 15, 10, 5].map((size) => ({ size }));
const r = squarify(items, 0, 0, 400, 200);
assert.strictEqual(r.length, 5);
const area = r.reduce((s, t) => s + t.w * t.h, 0);
assert(Math.abs(area - 80000) < 1e-6, "areas fill box");
for (const t of r) {
  assert(Math.abs(t.w * t.h - t.item.size * 800) < 1e-6, "area proportional");
  assert(t.x >= -1e-9 && t.y >= -1e-9 && t.x + t.w <= 400 + 1e-9 && t.y + t.h <= 200 + 1e-9, "in bounds");
}
assert.deepStrictEqual(squarify([], 0, 0, 10, 10), []);
console.log("ok");
