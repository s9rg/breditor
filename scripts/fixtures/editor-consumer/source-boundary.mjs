/** Record package namespaces from a separate installed candidate consumer. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const packages = ["@breditor/browser", "@breditor/editor"];
const hidden = [
  "@breditor/browser/dist/browser_editor.js",
  "@breditor/editor/dist/runtime.js",
  "@breditor/editor/local",
];

async function observeInstalledBoundary() {
  const observed = {};
  const modules = new URL("node_modules/", import.meta.url);
  for (const name of packages) {
    const installed = fileURLToPath(new URL(name, modules));
    assert.equal(realpathSync(installed), installed, `${name} must be a separate installed package`);
    const { exports } = JSON.parse(readFileSync(`${installed}/package.json`, "utf8"));
    const entries = {};
    for (const route of Object.keys(exports).sort()) {
      const specifier = route === "." ? name : `${name}${route.slice(1)}`;
      const conditions = Object.keys(exports[route]).sort();
      assert.ok(conditions.includes("types"), `${specifier} must declare types`);
      assert.ok(conditions.includes("import"), `${specifier} must declare an ESM entry`);
      const module = await import(specifier);
      entries[route] = { conditions, values: Object.keys(module).sort() };
    }
    observed[name] = entries;
  }

  for (const specifier of hidden) {
    await assert.rejects(import(specifier), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
  }
  return observed;
}

const observed = await observeInstalledBoundary();
const expected = new URL("source-boundary.json", import.meta.url);
if (process.argv[2] === "--print" && process.argv.length === 3) {
  console.log(JSON.stringify(observed, null, 2));
} else {
  const compiler = process.argv[2];
  assert.ok(compiler && isAbsolute(compiler) && process.argv.length === 3,
    "Use the absolute TypeScript CLI path for verification or --print for review");
  assert.deepEqual(observed, JSON.parse(readFileSync(expected, "utf8")),
    "Installed package routes or runtime names changed. Review the compatibility boundary with the API change.");

  // Compare the type-visible values against the exact installed ESM namespaces.
  const checks = Object.entries(observed).flatMap(([name, entries]) =>
    Object.entries(entries).map(([route, { values }]) => {
      const specifier = route === "." ? name : `${name}${route.slice(1)}`;
      const actual = `keyof typeof import(${JSON.stringify(specifier)})`;
      const recorded = values.map(value => JSON.stringify(value)).join(" | ") || "never";
      return `type Entry${JSON.stringify(specifier).replace(/\W/g, "_")} = Assert<Equal<${actual}, ${recorded}>>;`;
    }));
  const generated = new URL("source-boundary-values.mts", import.meta.url);
  writeFileSync(generated, [
    'import type { Assert, Equal } from "./source-boundary-types.mjs";',
    ...checks,
  ].join("\n") + "\n");
  execFileSync(process.execPath, [compiler, "--noEmit", "--strict", "--exactOptionalPropertyTypes",
    "--noUncheckedIndexedAccess", "--target", "ES2022", "--module", "NodeNext", "--lib", "ES2022,DOM,ESNext.Disposable",
    "source-boundary-values.mts", "source-boundary-types.mts"],
    { cwd: fileURLToPath(new URL("./", import.meta.url)), stdio: "inherit" });
  console.log(JSON.stringify({ packages: packages.length, routes: checks.length, hiddenPathRefusals: hidden.length,
    runtimeTypeNamesMatch: true, strictLifecycleTypes: true }));
}
