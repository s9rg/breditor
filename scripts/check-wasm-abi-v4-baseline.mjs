import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const declarationPath = join(
  repository,
  "crates/breditor-wasm/api/breditor_wasm.d.ts",
);
const versionPath = join(repository, "crates/breditor-wasm/src/version.rs");

const expectedNormalizedSha256 =
  "3ba4518297021a3e7a8a50595fbb469889decfeb07eccfc32b64643b51dd593b";
const expectedInitOutputMembers = 223;

const declaration = readFileSync(declarationPath, "utf8");
const marker = "export interface InitOutput {";
const interfaceStart = declaration.indexOf(marker);
if (interfaceStart < 0) fail("reviewed declaration has no InitOutput interface");
const bodyStart = declaration.indexOf("\n", interfaceStart) + 1;
const bodyEnd = declaration.indexOf("\n}", bodyStart);
if (bodyStart === 0 || bodyEnd < 0) fail("reviewed InitOutput interface is incomplete");

const members = declaration
  .slice(bodyStart, bodyEnd)
  .split("\n")
  .filter((line) => line.length > 0);
if (members.length !== expectedInitOutputMembers) {
  fail(
    "reviewed InitOutput has " +
      members.length +
      "; ABI 4 requires " +
      expectedInitOutputMembers,
  );
}
if (new Set(members).size !== members.length) {
  fail("reviewed InitOutput contains a duplicate member signature");
}

// Rust/linker refactoring can reorder the Wasm export table without changing
// the ABI. Normalize only that generated order; every other declaration byte
// and every complete member signature remains locked.
const normalized =
  declaration.slice(0, bodyStart) +
  [...members].sort().join("\n") +
  declaration.slice(bodyEnd);
const actual = createHash("sha256").update(normalized).digest("hex");
if (actual !== expectedNormalizedSha256) {
  fail(
    "reviewed declaration changed ABI 4 (normalized SHA-256 " +
      actual +
      "; expected " +
      expectedNormalizedSha256 +
      ")",
  );
}

const versionSource = readFileSync(versionPath, "utf8");
if (
  !versionSource.includes(
    'pub const BREDITOR_WASM_ABI_VERSION: &str = "4";',
  )
) {
  fail("Rust Wasm boundary no longer declares exact ABI generation 4");
}

console.log(
  "check-wasm-abi-v4-baseline: " +
    members.length +
    " signatures and ABI generation 4 are unchanged.",
);

function fail(message) {
  console.error("check-wasm-abi-v4-baseline: " + message);
  process.exit(1);
}
