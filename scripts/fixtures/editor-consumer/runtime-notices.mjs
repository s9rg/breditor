/** Verify that clean archives retain the generated inventory/text/toolchain binding. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {dirname,join} from "node:path";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
export function assertRuntimeNotices(binaryPath,kind){
 const root=dirname(binaryPath),record=JSON.parse(readFileSync(join(root,"breditor_dependency_inventory.json"),"utf8"));
 const {sha256,runtime,runtimeWasmSha256,noticeBundleSha256,cargoLockSha256,rust,...body}=record;
 assert.equal(record.format,"breditor/candidate-dependency-inventory");assert.equal(record.formatVersion,1);assert.equal(runtime,kind);assert.equal(hash(JSON.stringify(body)),sha256,"Inventory graph/text hashes must retain their exact binding");
 const binary=readFileSync(binaryPath);assert.equal(hash(binary),runtimeWasmSha256,"Notices belong to the installed binary");assert.match(cargoLockSha256,/^[a-f0-9]{64}$/);
 assert.ok(!/\/Users\/[^/\0]+\/|\/home\/[^/\0]+\/|\/root\/|[A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+/.test(binary.toString("latin1")),"Installed Wasm must not retain build-home paths");
 const text=readFileSync(join(root,"THIRD_PARTY_NOTICES.txt"));assert.equal(hash(text),noticeBundleSha256);assert.ok(text.toString("utf8").includes(sha256));
 assert.equal(rust.release,"1.98.0");assert.equal(hash(readFileSync(join(root,"RUST_COPYRIGHT-library.html"))),rust.libraryNoticeSha256);
 assert.equal(record.licenseReview,"not-approved");assert.equal(record.publicationApproved,false);assert.equal(record.crateSourceVerification,"not-performed");assert.ok(Array.isArray(record.gaps));assert.ok(record.packages.length>20);
 assert.ok(record.packages.filter(p=>p.source!=="first-party").some(p=>p.notices.length>0));
 return {runtime,packages:record.packages.length,openNoticeGaps:record.gaps.length};
}
