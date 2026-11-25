/** Verify the independent installed interchange consumer before probing or reusing it. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {lstatSync,readFileSync,realpathSync} from "node:fs";
import {dirname,join,relative,sep} from "node:path";
import {sourceEvidence} from "./candidate-release/evidence.mjs";
import {verifyInstalledArchiveBindings} from "./installed-archive-digests.mjs";
import {verifySearchConsumerRegistry} from "./search-consumer-lock.mjs";

export const interchangeConsumerPackages=Object.freeze([
 "@breditor/browser","@breditor/experimental-rich-content","@breditor/collaboration","@breditor/editor","@breditor/interchange",
]);

function platformMatches(values,platform){
 if(!values)return true;
 const choices=Array.isArray(values)?values:[values];
 return !choices.includes("!"+platform)&&
  (choices.includes(platform)||choices.includes("any")||choices.every(choice=>choice.startsWith("!")));
}

function verifyInstalledRegistryVersions(consumer,lock){
 const directory=realpathSync(consumer);
 for(const [path,row]of Object.entries(lock.packages)){
  if(!row.resolved?.startsWith("https://registry.npmjs.org/"))continue;
  assert.ok(path.startsWith("node_modules/")&&!path.split(/[\\/]/u).includes(".."),
   "Invalid installed registry package location");
  const packageJson=join(directory,path,"package.json"),stat=lstatSync(packageJson,{throwIfNoEntry:false});
  if(!stat&&row.optional===true){
   const libc=row.libc&&process.platform==="linux"?
    (process.report.getReport().header.glibcVersionRuntime?"glibc":"musl"):undefined;
   if(!platformMatches(row.os,process.platform)||!platformMatches(row.cpu,process.arch)||
    (libc&&!platformMatches(row.libc,libc)))continue;
  }
  assert.ok(stat?.isFile()&&relative(directory,realpathSync(packageJson)).startsWith("node_modules"+sep),
   `Missing installed registry package manifest: ${path}`);
  assert.equal(JSON.parse(readFileSync(packageJson)).version,row.version,`Installed registry package version differs: ${path}`);
 }
}

export function interchangeConsumerLockEvidence(root,consumer,archives,names=interchangeConsumerPackages){
 assert.deepEqual(archives.map(row=>row.name),names,"Interchange consumer archive inventory differs");
 const directory=dirname(archives[0].path);
 for(const archive of archives){
  assert.equal(archive.path,join(directory,archive.filename),`Interchange consumer archive path differs for ${archive.name}`);
 }
 const producer=JSON.parse(readFileSync(join(root,"package-lock.json")));
 const bytes=readFileSync(join(consumer,"package-lock.json")),lock=JSON.parse(bytes);
 verifyInstalledArchiveBindings(directory,consumer,lock,archives);
 const registryArtifacts=verifySearchConsumerRegistry(producer,lock);
 verifyInstalledRegistryVersions(consumer,lock);
 return {registryArtifacts,consumerLockSha256:createHash("sha256").update(bytes).digest("hex")};
}

export function verifyInterchangeConsumerReuse(root,report){
 assert.ok(report.format==="breditor/interchange-installed-consumer"&&report.formatVersion===1&&report.passed===true,
  "Expected a successful interchange consumer report");
 assert.deepEqual(report.source,sourceEvidence(root),"Installed interchange consumer belongs to another candidate");
 const observed=interchangeConsumerLockEvidence(root,report.consumer,report.archives);
 assert.deepEqual(observed,{registryArtifacts:report.registryArtifacts,consumerLockSha256:report.consumerLockSha256},
  "Installed interchange consumer lock changed since qualification");
}
