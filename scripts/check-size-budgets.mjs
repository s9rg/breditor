import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));

const budgets = Object.freeze([
  Object.freeze({
    label: "browser emitted JavaScript",
    actual: sumFiles("packages/breditor-browser/dist", (name) =>
      name.endsWith(".js"),
    ),
    maximum: 1_011_000,
  }),
  Object.freeze({
    label: "browser declarations",
    actual: sumFiles("packages/breditor-browser/dist", (name) =>
      name.endsWith(".d.ts"),
    ),
    maximum: 254_000,
  }),
  Object.freeze({
    label: "reference Showcase emitted JavaScript",
    actual: sumFiles("packages/breditor-reference-highlight/dist", (name) =>
      name.endsWith(".js"),
    ),
    maximum: 45_000,
  }),
  Object.freeze({
    label: "reference Showcase declarations",
    actual: sumFiles("packages/breditor-reference-highlight/dist", (name) =>
      name.endsWith(".d.ts"),
    ),
    maximum: 39_000,
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
    822_000,
  ),
  matchedFilesGzipBudget(
    "reference application JavaScript (gzip)",
    "examples/react/dist/assets",
    (name) => name.endsWith(".js"),
    216_000,
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

let failed = false;
for (const budget of budgets) {
  const verdict = budget.actual <= budget.maximum ? "PASS" : "FAIL";
  console.log(
    `${verdict} ${budget.label}: ${budget.actual.toLocaleString("en-US")} / ${budget.maximum.toLocaleString("en-US")} bytes`,
  );
  if (verdict === "FAIL") failed = true;
}

if (failed) {
  console.error(
    "check-size-budgets: one or more release budgets were exceeded",
  );
  process.exitCode = 1;
} else {
  console.log("check-size-budgets: all release budgets passed");
}

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
