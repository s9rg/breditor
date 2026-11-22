import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
if (args.length > 1 || args.some(arg => arg !== "--json")) {
  throw new Error("Usage: node scripts/check-size-budgets.mjs [--json]");
}

const budgets = Object.freeze([
  Object.freeze({
    label: "browser emitted JavaScript",
    actual: sumFiles("packages/breditor-browser/dist", (name) =>
      name.endsWith(".js"),
    ),
    maximum: 1_085_000,
  }),
  Object.freeze({
    label: "browser declarations",
    actual: sumFiles("packages/breditor-browser/dist", (name) =>
      name.endsWith(".d.ts"),
    ),
    maximum: 276_000,
  }),
  Object.freeze({
    label: "reference Showcase emitted JavaScript",
    actual: sumFiles("packages/breditor-reference-highlight/dist", (name) =>
      name.endsWith(".js"),
    ),
    maximum: 82_000,
  }),
  Object.freeze({
    label: "reference Showcase declarations",
    actual: sumFiles("packages/breditor-reference-highlight/dist", (name) =>
      name.endsWith(".d.ts"),
    ),
    maximum: 72_000,
  }),
  fileBudget(
    "generated Wasm binary",
    "packages/breditor-wasm/dist/breditor_wasm_bg.wasm",
    1_610_000,
  ),
  fileBudget(
    "generated Wasm JavaScript glue",
    "packages/breditor-wasm/dist/breditor_wasm.js",
    100_000,
  ),
  matchedFilesBudget(
    "reference application JavaScript",
    "examples/react/dist/assets",
    (name) => name.endsWith(".js"),
    865_000,
  ),
  matchedFilesGzipBudget(
    "reference application JavaScript (gzip)",
    "examples/react/dist/assets",
    (name) => name.endsWith(".js"),
    225_000,
  ),
  matchedFileBudget(
    "reference application Wasm",
    "examples/react/dist/assets",
    (name) => name.startsWith("breditor_wasm_bg-") && name.endsWith(".wasm"),
    1_610_000,
  ),
  matchedGzipBudget(
    "reference application Wasm (gzip)",
    "examples/react/dist/assets",
    (name) => name.startsWith("breditor_wasm_bg-") && name.endsWith(".wasm"),
    452_000,
  ),
]);

const rows = budgets.map(budget => ({
  ...budget,
  remaining: budget.maximum - budget.actual,
  passed: budget.actual <= budget.maximum,
}));
const passed = rows.every(row => row.passed);
if (args.includes("--json")) {
  console.log(JSON.stringify({format: "breditor/default-size-budgets", formatVersion: 1, passed, budgets: rows}, null, 2));
} else {
  for (const {label, actual, maximum, passed} of rows) {
    console.log(
      `${passed ? "PASS" : "FAIL"} ${label}: ${actual.toLocaleString("en-US")} / ${maximum.toLocaleString("en-US")} bytes`,
    );
  }
  if (passed) console.log("check-size-budgets: all release budgets passed");
  else console.error("check-size-budgets: one or more release budgets were exceeded");
}
if (!passed) process.exitCode = 1;

function sumFiles(directory, accepts) {
  const absolute = join(repository, directory);
  const paths = descendantFiles(absolute).filter((path) =>
    accepts(relative(absolute, path)),
  );
  if (paths.length === 0) {
    throw new Error(
      `no size-budget inputs found in ${relative(repository, absolute)}`,
    );
  }
  return paths.reduce((total, path) => total + statSync(path).size, 0);
}

function descendantFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? descendantFiles(path) : [path];
  });
}

function fileBudget(label, path, maximum) {
  return Object.freeze({
    label,
    actual: statSync(join(repository, path)).size,
    maximum,
  });
}

function matchedFileBudget(label, directory, accepts, maximum) {
  const path = oneMatchedFile(directory, accepts);
  return fileBudget(label, path, maximum);
}

function matchedFilesBudget(label, directory, accepts, maximum) {
  return Object.freeze({
    label,
    actual: sumFiles(directory, accepts),
    maximum,
  });
}

function matchedGzipBudget(label, directory, accepts, maximum) {
  const path = oneMatchedFile(directory, accepts);
  return Object.freeze({
    label,
    actual: gzipSync(readFileSync(join(repository, path)), { level: 9 })
      .byteLength,
    maximum,
  });
}

function matchedFilesGzipBudget(label, directory, accepts, maximum) {
  const absolute = join(repository, directory);
  const paths = descendantFiles(absolute).filter((path) =>
    accepts(relative(absolute, path)),
  );
  if (paths.length === 0) {
    throw new Error(
      `no size-budget inputs found in ${relative(repository, absolute)}`,
    );
  }
  return Object.freeze({
    label,
    actual: paths.reduce(
      (total, path) =>
        total + gzipSync(readFileSync(path), { level: 9 }).byteLength,
      0,
    ),
    maximum,
  });
}

function oneMatchedFile(directory, accepts) {
  const absolute = join(repository, directory);
  const names = readdirSync(absolute).filter(accepts);
  if (names.length !== 1) {
    throw new Error(
      `expected exactly one size-budget input in ${relative(repository, absolute)}; found ${names.length}`,
    );
  }
  return join(directory, names[0]);
}
