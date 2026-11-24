/** Source-bound executable bytes for the three companion relay fixtures. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {join} from "node:path";
import {fileEvidence,saveEvidence,sourceEvidence} from "./evidence.mjs";
import {nativeSuggestionTarget} from "./native-suggestion-build-evidence.mjs";

export const metadataReconciliationHosts=Object.freeze([
 "selected_delivery_functional","segmented_relay_functional","generation_complete_control_functional",
]);
export const metadataReconciliationHostReceipt="target/metadata-reconciliation-host-build.json";
const format="breditor/metadata-reconciliation-host-build";
const host=()=>({platform:process.platform,arch:process.arch});
const pathFor=name=>`${nativeSuggestionTarget}/release/examples/${name}${process.platform==="win32"?".exe":""}`;

function binaries(root){
 return Object.fromEntries(metadataReconciliationHosts.map(name=>{
  const path=pathFor(name);
  assert.equal(realpathSync(join(root,path)),join(root,path),"Use the owned Native reconciliation build path");
  const {bytes,sha256}=fileEvidence(root,path);
  assert.ok(bytes>0,"Expected a nonempty Native reconciliation fixture");
  return [name,{path,bytes,sha256}];
 }));
}

export function retainMetadataReconciliationHosts(root,source,outputs){
 assert.deepEqual(outputs,metadataReconciliationHosts.map(name=>join(root,pathFor(name))));
 const receipt={format,version:1,source,host:host(),binaries:binaries(root)};
 assert.deepEqual(sourceEvidence(root),source,"Source changed during the Native reconciliation build");
 saveEvidence(join(root,metadataReconciliationHostReceipt),receipt);
 return receipt;
}

export function verifyMetadataReconciliationHosts(root,source){
 const {sha256}=fileEvidence(root,metadataReconciliationHostReceipt);
 const receipt=JSON.parse(readFileSync(join(root,metadataReconciliationHostReceipt)));
 assert.equal(receipt.format,format);
 assert.equal(receipt.version,1);
 assert.deepEqual(receipt.source,source,"Native reconciliation hosts belong to another candidate");
 assert.deepEqual(receipt.host,host(),"Native reconciliation hosts were built for another host");
 assert.deepEqual(receipt.binaries,binaries(root),"Native reconciliation fixtures differ from their build");
 assert.equal(fileEvidence(root,metadataReconciliationHostReceipt).sha256,sha256);
 return {sha256,binaries:receipt.binaries};
}
