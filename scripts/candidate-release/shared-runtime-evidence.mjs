/** Bind the compiler's shared Wasm and glue to this build and its exact source. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {fileEvidence, saveEvidence, sourceEvidence} from "./evidence.mjs";

export const sharedRuntimeBuildReport = "target/normal-shared-runtime-build.json";
const format = "breditor/normal-shared-runtime-build";
const runtimeNames = [
 "breditor_shared.js",
 "breditor_shared.d.ts",
 "breditor_shared_bg.wasm",
 "breditor_shared_bg.wasm.d.ts",
];

function sharedRuntimeFiles(root) {
 return runtimeNames.map(name => {
  const generated = fileEvidence(root, "target/promoted-shared-web/" + name);
  const packaged = fileEvidence(root, "packages/breditor-collaboration/dist/runtime/" + name);
  assert.equal(packaged.bytes, generated.bytes, "Packaged shared runtime differs from the generated file " + name);
  assert.equal(packaged.sha256, generated.sha256, "Packaged shared runtime differs from the generated file " + name);
  return {name, bytes:generated.bytes, sha256:generated.sha256};
 });
}

export function retainSharedRuntimeBuild(root, source) {
 const files = sharedRuntimeFiles(root);
 assert.deepEqual(sourceEvidence(root), source, "Source changed during the shared runtime build");
 const report = {format, version:1, source, files};
 saveEvidence(join(root, sharedRuntimeBuildReport), report);
 return report;
}

/** The enclosing candidate checks the source identity and required freshness. */
export function verifySharedRuntimeBuild(root, source) {
 fileEvidence(root, sharedRuntimeBuildReport);
 const report = JSON.parse(readFileSync(join(root, sharedRuntimeBuildReport)));
 assert.equal(report.format, format);
 assert.equal(report.version, 1);
 assert.deepEqual(report.source, source, "Shared runtime build belongs to another candidate");
 assert.deepEqual(report.files, sharedRuntimeFiles(root), "Shared runtime differs from the compiler's receipt");
 return report;
}
