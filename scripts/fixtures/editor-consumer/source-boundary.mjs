/** Record package namespaces from a separate installed candidate consumer. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packages = ["@breditor/browser", "@breditor/editor"];
const hidden = [
  "@breditor/browser/dist/browser_editor.js",
  "@breditor/editor/dist/runtime.js",
  "@breditor/editor/local",
];

export async function observeInstalledBoundary(compiler, packages, hidden, unavailable = []) {
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
      if (unavailable.includes(specifier)) continue;
      const module = await import(specifier);
      entries[route] = { conditions, values: Object.keys(module).sort() };
    }
    observed[name] = entries;
  }

  for (const specifier of hidden) {
    await assert.rejects(import(specifier), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
  }
  await addTypeOnlyExports(observed, compiler);
  return observed;
}

async function addTypeOnlyExports(observed, compiler) {
  const routes = Object.entries(observed).flatMap(([name, entries]) =>
    Object.entries(entries).map(([route, entry]) => ({ specifier: route === "." ? name : `${name}${route.slice(1)}`, entry })));
  const cwd = fileURLToPath(new URL("./", import.meta.url));
  const config = fileURLToPath(new URL("source-boundary-tsconfig.json", import.meta.url));
  const imports = fileURLToPath(new URL("source-boundary-imports.mts", import.meta.url));
  writeFileSync(imports, routes.map(({ specifier }, index) =>
    `import type * as Route${index} from ${JSON.stringify(specifier)};`).join("\n") + "\n");
  writeFileSync(config, JSON.stringify({
    compilerOptions: { module: "NodeNext", target: "ES2022", strict: true, lib: ["ES2022", "DOM", "ESNext.Disposable"] },
    files: ["source-boundary-imports.mts"],
  }));

  // Use the same locked TypeScript distribution as the strict CLI contract below.
  const checkerUrl = pathToFileURL(createRequire(compiler).resolve("typescript/unstable/sync"));
  const { API, SymbolFlags } = await import(checkerUrl.href);
  const api = new API({ cwd });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [config] });
    try {
      const project = snapshot.getProject(config);
      assert.ok(project, "TypeScript did not open the installed consumer project");
      const { program, checker } = project;
      const source = program.getSourceFile(imports);
      assert.ok(source);
      assert.equal(source.statements.length, routes.length);
      const modules = checker.getSymbolAtLocation(source.statements.map(statement => statement.moduleSpecifier));
      for (const [index, { specifier, entry }] of routes.entries()) {
        const module = modules[index];
        assert.ok(module, `TypeScript could not resolve the installed route ${specifier}`);
        const values = new Set(entry.values);
        const typeOnly = [];
        for (const exported of checker.getExportsOfModule(module)) {
          if (values.has(exported.name)) continue;
          if (exported.flags & SymbolFlags.Alias) {
            assert.ok(!checker.isUnknownSymbol(checker.getAliasedSymbol(exported)),
              `TypeScript could not resolve ${exported.name} from ${specifier}`);
          }
          typeOnly.push(exported.name);
        }
        entry.typeOnly = typeOnly.sort();
      }
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}

export function verifyRuntimeValueTypes(observed, compiler, typeFixtures = []) {
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
    "type Assert<T extends true> = T;",
    "type Equal<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;",
    ...checks,
  ].join("\n") + "\n");
  execFileSync(process.execPath, [compiler, "--noEmit", "--strict", "--exactOptionalPropertyTypes",
    "--noUncheckedIndexedAccess", "--target", "ES2022", "--module", "NodeNext", "--lib", "ES2022,DOM,ESNext.Disposable",
    "source-boundary-values.mts", ...typeFixtures],
    { cwd: fileURLToPath(new URL("./", import.meta.url)), stdio: "inherit" });
  return checks.length;
}

async function main() {
  const [compiler, mode] = process.argv.slice(2);
  assert.ok(compiler && isAbsolute(compiler) && (mode === undefined || mode === "--print") && process.argv.length <= 4,
    "Use the absolute TypeScript CLI path, optionally followed by --print for review");
  const observed = await observeInstalledBoundary(compiler, packages, hidden);
  if (mode === "--print") {
    console.log(JSON.stringify(observed, null, 2));
    return;
  }
  const expected = new URL("source-boundary.json", import.meta.url);
  assert.deepEqual(observed, JSON.parse(readFileSync(expected, "utf8")),
    "Installed package routes, runtime names or type-only exports changed. Review the compatibility boundary with the API change.");
  const checkedRoutes = verifyRuntimeValueTypes(observed, compiler, ["source-boundary-types.mts"]);
  console.log(JSON.stringify({ packages: packages.length, routes: checkedRoutes, hiddenPathRefusals: hidden.length,
    runtimeTypeNamesMatch: true, typeOnlyNamesMatch: true, strictLifecycleTypes: true }));
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
