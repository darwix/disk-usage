// Builds dist/DiskUsage.exe: a copy of node.exe with scan.js + assets injected (Node SEA).
const { execSync } = require("child_process");
const fs = require("fs");
const rcedit = require("rcedit");

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
// antivirus briefly locks a freshly written exe; retry each step that touches it
async function retry(fn) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === 4) throw e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

fs.mkdirSync("dist", { recursive: true });
(async () => {
  run("node --experimental-sea-config sea-config.json");
  // copy node.exe with PE subsystem 3 (console) -> 2 (GUI): no terminal window. Field sits at PE header + 0x5C.
  const exe = fs.readFileSync(process.execPath);
  exe.writeUInt16LE(2, exe.readUInt32LE(0x3c) + 0x5c);
  await retry(() => fs.writeFileSync("dist/DiskUsage.exe", exe));
  // icon must go in before the blob; rcedit after postject corrupts the SEA
  await retry(() => rcedit("dist/DiskUsage.exe", { icon: "assets/icon.ico" }));
  await retry(() =>
    run(
      "npx --yes postject@1.0.0-alpha.6 dist/DiskUsage.exe NODE_SEA_BLOB dist/sea-prep.blob " +
        "--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    ),
  );
  fs.rmSync("dist/sea-prep.blob");
  console.log("Built dist/DiskUsage.exe");
})();
