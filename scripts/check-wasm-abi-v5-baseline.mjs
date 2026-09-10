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
  "0ce784ecc3ee864a02f75cb127cfef0c94114e10aaffdca8f3553545facc879a";
const expectedInitOutputMembers = 227;
const expectedAbi4MemberSha256 =
  "7816292b461134dcaa8d1698db75003088dad140ce978f123754224235c974f3";
const abi5AddedMembers = new Set([
  "    readonly breditorcompiledprofiledescriptor_inlineFormatSetActionStateId: (a: number, b: number, c: number) => void;",
  "    readonly breditorcompiledprofiledescriptor_inlineFormatSetCount: (a: number) => number;",
  "    readonly breditorcompiledprofiledescriptor_inlineFormatSetFormatKind: (a: number, b: number, c: number) => void;",
  "    readonly breditorcompiledprofiledescriptor_inlineFormatSetIntentId: (a: number, b: number, c: number) => void;",
]);

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
      "; ABI 5 requires " +
      expectedInitOutputMembers,
  );
}
if (new Set(members).size !== members.length) {
  fail("reviewed InitOutput contains a duplicate member signature");
}
for (const addition of abi5AddedMembers) {
  if (!members.includes(addition)) {
    fail("reviewed InitOutput is missing one exact ABI 5 descriptor addition");
  }
}
const abi4Members = members.filter((member) => !abi5AddedMembers.has(member));
const abi4MemberSha256 = createHash("sha256")
  .update([...abi4Members].sort().join("\n"))
  .digest("hex");
if (abi4Members.length !== 223 || abi4MemberSha256 !== expectedAbi4MemberSha256) {
  fail("ABI 5 did not preserve every exact ABI 4 InitOutput member");
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
    "reviewed declaration changed ABI 5 (normalized SHA-256 " +
      actual +
      "; expected " +
      expectedNormalizedSha256 +
      ")",
  );
}

const versionSource = readFileSync(versionPath, "utf8");
if (
  !versionSource.includes(
    'pub const BREDITOR_WASM_ABI_VERSION: &str = "5";',
  )
) {
  fail("Rust Wasm boundary no longer declares exact ABI generation 5");
}

console.log(
  "check-wasm-abi-v5-baseline: " +
    members.length +
    " signatures and ABI generation 5 are unchanged.",
);

function fail(message) {
  console.error("check-wasm-abi-v5-baseline: " + message);
  process.exit(1);
}
