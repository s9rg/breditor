/** Portable receipt lookup for source fixtures and independently installed copies. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {lstatSync, readFileSync} from "node:fs";
import {join} from "node:path";

export const sharedRuntimeBuildReport = "target/normal-shared-runtime-build.json";
export const sharedRuntimeBuildFormat = "breditor/normal-shared-runtime-build";
export const sharedRuntimeReceiptVariable = "BREDITOR_SHARED_RUNTIME_RECEIPT_SHA256";

export function pinnedSharedRuntimeReceipt(root, expectedSha256) {
 assert.match(expectedSha256, /^[a-f0-9]{64}$/);
 const path = join(root, sharedRuntimeBuildReport);
 const stat = lstatSync(path);
 assert.ok(stat.isFile() && stat.size <= 64 * 1024, "Invalid shared runtime build receipt file");
 const bytes = readFileSync(path);
 const sha256 = createHash("sha256").update(bytes).digest("hex");
 assert.equal(sha256, expectedSha256, "Shared runtime receipt differs from the verified build");
 const report = JSON.parse(bytes);
 assert.equal(report.format, sharedRuntimeBuildFormat);
 assert.equal(report.version, 1);
 const wasm = report.files.filter(row => row.name === "breditor_shared_bg.wasm");
 assert.equal(wasm.length, 1, "Shared runtime receipt must name one Wasm file");
 assert.match(wasm[0].sha256, /^[a-f0-9]{64}$/);
 return {report, wasmSha256:wasm[0].sha256};
}
