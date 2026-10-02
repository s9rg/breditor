import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

// Usage: node .../audit_number_modules.mjs /absolute/path/to/wabt/index.js
// WABT stays outside project dependencies. Outputs are disposable build artifacts.
if (!process.argv[2]) throw new Error("Supply an installed WABT index.js path");
const wabtEntry = resolve(process.argv[2]);
const wabtVersion = JSON.parse(readFileSync(resolve(dirname(wabtEntry), "package.json"), "utf8")).version;
const wabt = await (await import(pathToFileURL(wabtEntry).href)).default();
const sourceDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(sourceDir, "../../../target/number-module-audit");
mkdirSync(outputDir, { recursive: true });
const report = { tool: "wabt", version: wabtVersion };
for (const name of ["constant_bound", "memory_bound"]) {
  const parsed = wabt.parseWat(`${name}.wat`, readFileSync(resolve(sourceDir, `${name}.wat`), "utf8"));
  try {
    parsed.resolveNames();
    parsed.validate();
    const { buffer } = parsed.toBinary({ canonicalize_lebs: true, write_debug_names: false });
    assert.equal(WebAssembly.validate(buffer), true);
    const decoded = wabt.readWasm(buffer, { readDebugNames: false });
    try {
      decoded.validate();
      writeFileSync(resolve(outputDir, `${name}.wat`), decoded.toText({ foldExprs: false, inlineExport: false }));
    } finally { decoded.destroy(); }
    const module = new WebAssembly.Module(buffer);
    assert.deepEqual(WebAssembly.Module.imports(module), []);
    assert.deepEqual(WebAssembly.Module.exports(module), [{ name: "bound", kind: "function" }]);
    const bound = new WebAssembly.Instance(module).exports.bound;
    for (let i = 0; i < 100_000; i++) assert.equal(bound(i, 2, 0), 2048);
    let matchesHandwritten;
    {
      const sourceFile = name === "constant_bound" ? "constant_bound_wasm.ts" : "alternative_bound_sources.ts";
      const source = readFileSync(resolve(sourceDir, sourceFile), "utf8");
      const match = source.match(/new Uint8Array\(\[([\s\S]*?)\]\)/);
      assert.ok(match, "Hand-written byte literal moved");
      const handwritten = Uint8Array.from(match[1].split(",").map(value => value.trim()).filter(Boolean).map(Number));
      assert.deepEqual(new Uint8Array(buffer), handwritten);
      matchesHandwritten = true;
    }
    writeFileSync(resolve(outputDir, `${name}.wasm`), buffer);
    report[name] = { bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex"), matchesHandwritten,
      nodeCallsPassed: 100_000, byteArray: Array.from(buffer) };
  } finally { parsed.destroy(); }
}
writeFileSync(resolve(outputDir, "audit.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
