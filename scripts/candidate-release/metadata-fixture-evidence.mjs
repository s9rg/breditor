/** Verify the two generated runtimes used by the current metadata qualification. */
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {join} from "node:path";
import {nativeSuggestionBuildReport, verifyNativeSuggestionBuild} from "./native-suggestion-build-evidence.mjs";
import {
 copySharedRuntimeForActivation, sharedRuntimeBuildReport, sharedRuntimeForActivation,
} from "./shared-runtime-evidence.mjs";
import {
 historicalSharedWasmSha256, sharedRuntimeReceiptVariable,
} from "../fixtures/native-runtime/shared-runtime-receipt.mjs";

const historicalNativeSha256 = "60427bb794f52c39a7084fac797f8f3150501238c45c78bad6195cd928a252ca";

export const metadataFixtureStageIds = Object.freeze([
 "local-metadata-delivery-cold-native",
 "installed-local-metadata-delivery",
 "local-metadata-room-references-native",
 "local-metadata-reference-read-close-native",
 "installed-local-metadata-room-references",
 "local-metadata-availability-native",
 "installed-local-metadata-availability",
 "local-metadata-materialization-native",
 "installed-local-metadata-materialization",
 "recoverable-metadata-local-only-native",
 "installed-recoverable-metadata",
 "metadata-server-bytes-native",
 "installed-metadata-server-bytes",
 "metadata-handover-native",
 "installed-metadata-handover",
 "handover-recovery-bytes-native",
 "installed-handover-recovery-bytes",
 "handover-activation-intent-native",
 "installed-handover-activation-intent",
 "metadata-reconciliation-native",
 "installed-metadata-reconciliation",
]);

export function metadataFixtureEvidence(root, source, consumer) {
 const expected = process.env[sharedRuntimeReceiptVariable];
 const hasReceipts = [nativeSuggestionBuildReport,sharedRuntimeBuildReport].some(path => existsSync(join(root,path)));
 if (!hasReceipts && expected === undefined) {
  return {
   nativeHostSha256:historicalNativeSha256, normalWasmSha256:historicalSharedWasmSha256,
   nativeHostBuildReceiptSha256:null, sharedRuntimeReceiptSha256:null, environment:{},
  };
 }
 const native = verifyNativeSuggestionBuild(root, source);
 const runtime = consumer ? copySharedRuntimeForActivation(root, consumer, source) :
  sharedRuntimeForActivation(root, source);
 assert.ok(runtime, "Metadata qualification requires the shared runtime build receipt");
 if (expected !== undefined) assert.equal(runtime.sha256, expected, "Metadata launcher received a different runtime receipt");
 return {
  nativeHostSha256:native.binary.sha256, normalWasmSha256:runtime.wasmSha256,
  nativeHostBuildReceiptSha256:native.sha256, sharedRuntimeReceiptSha256:runtime.sha256,
  environment:runtime.environment,
 };
}
