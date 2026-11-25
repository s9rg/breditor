/** Verify the independent installed interchange consumer before probing or reusing it. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {sourceEvidence} from "./candidate-release/evidence.mjs";
import {verifyInstalledArchiveBindings} from "./installed-archive-digests.mjs";
import {verifySearchConsumerRegistry} from "./search-consumer-lock.mjs";

export const interchangeConsumerPackages=Object.freeze([
 "@breditor/browser","@breditor/experimental-rich-content","@breditor/collaboration","@breditor/editor","@breditor/interchange",
]);

export function interchangeConsumerLockEvidence(root,consumer,archives,names=interchangeConsumerPackages){
 assert.deepEqual(archives.map(row=>row.name),names,"Interchange consumer archive inventory differs");
 const directory=dirname(archives[0].path);
 for(const archive of archives){
  assert.equal(archive.path,join(directory,archive.filename),`Interchange consumer archive path differs for ${archive.name}`);
 }
 const producer=JSON.parse(readFileSync(join(root,"package-lock.json")));
 const bytes=readFileSync(join(consumer,"package-lock.json")),lock=JSON.parse(bytes);
 verifyInstalledArchiveBindings(directory,consumer,lock,archives);
 return {registryArtifacts:verifySearchConsumerRegistry(producer,lock),
  consumerLockSha256:createHash("sha256").update(bytes).digest("hex")};
}

export function verifyInterchangeConsumerReuse(root,report){
 assert.ok(report.format==="breditor/interchange-installed-consumer"&&report.formatVersion===1&&report.passed===true,
  "Expected a successful interchange consumer report");
 assert.deepEqual(report.source,sourceEvidence(root),"Installed interchange consumer belongs to another candidate");
 const observed=interchangeConsumerLockEvidence(root,report.consumer,report.archives);
 assert.deepEqual(observed,{registryArtifacts:report.registryArtifacts,consumerLockSha256:report.consumerLockSha256},
  "Installed interchange consumer lock changed since qualification");
}
