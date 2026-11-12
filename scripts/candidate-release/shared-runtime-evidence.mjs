/** Bind the compiler's shared Wasm and glue to this build and its exact source. */
import assert from "node:assert/strict";
import {constants, copyFileSync, existsSync, mkdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileEvidence, saveEvidence, sourceEvidence} from "./evidence.mjs";
import {
 pinnedSharedRuntimeReceipt, sharedRuntimeBuildFormat, sharedRuntimeBuildReport, sharedRuntimeReceiptVariable,
} from "../fixtures/native-runtime/shared-runtime-receipt.mjs";

export {sharedRuntimeBuildReport};
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
 const report = {format:sharedRuntimeBuildFormat, version:1, source, files};
 saveEvidence(join(root, sharedRuntimeBuildReport), report);
 return report;
}

/** The enclosing candidate checks the source identity and required freshness. */
export function verifySharedRuntimeBuild(root, source) {
 const {sha256} = fileEvidence(root, sharedRuntimeBuildReport);
 return verifySharedRuntimeReceipt(root, source, sha256).report;
}

function verifySharedRuntimeReceipt(root, source, sha256) {
 const receipt = pinnedSharedRuntimeReceipt(root, sha256);
 const {report} = receipt;
 assert.deepEqual(report.source, source, "Shared runtime build belongs to another candidate");
 assert.deepEqual(report.files, sharedRuntimeFiles(root), "Shared runtime differs from the compiler's receipt");
 return receipt;
}

export function sharedRuntimeForActivation(root, source) {
 const {sha256} = fileEvidence(root, sharedRuntimeBuildReport);
 const {wasmSha256} = verifySharedRuntimeReceipt(root, source, sha256);
 return {sha256, wasmSha256, environment:{[sharedRuntimeReceiptVariable]:sha256}};
}

/** The consumer receives a local receipt, and the launcher supplies its independent digest. */
export function copySharedRuntimeForActivation(root, consumer, source) {
 const path = join(root, sharedRuntimeBuildReport);
 const expected = process.env[sharedRuntimeReceiptVariable];
 if (expected === undefined && !existsSync(path)) return undefined;
 const runtime = sharedRuntimeForActivation(root, source);
 if (expected !== undefined) assert.equal(runtime.sha256, expected, "Activation launcher received a different runtime receipt");
 const destination = join(consumer, sharedRuntimeBuildReport);
 mkdirSync(dirname(destination), {recursive:true});
 copyFileSync(path, destination, constants.COPYFILE_EXCL);
 assert.equal(pinnedSharedRuntimeReceipt(consumer, runtime.sha256).wasmSha256, runtime.wasmSha256);
 return runtime;
}
