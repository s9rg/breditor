/** Keep exact npm archive identity from packing through installed execution. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {lstatSync,readFileSync} from "node:fs";
import {join,resolve} from "node:path";

const maximumArchiveBytes=32*1024*1024;

function archiveDigests(path){
 const stat=lstatSync(path);
 assert.ok(stat.isFile()&&stat.size<=maximumArchiveBytes,"Expected a bounded npm archive file");
 const bytes=readFileSync(path);
 assert.equal(bytes.length,stat.size,"npm archive changed during its read");
 return {
  sha256:createHash("sha256").update(bytes).digest("hex"),
  integrity:"sha512-"+createHash("sha512").update(bytes).digest("base64"),
 };
}

export function captureNativeConsumerArchives(directory,packs){
 return packs.map(({name,filename,integrity})=>{
  assert.match(filename,/^[a-z0-9_.-]+\.tgz$/iu,"Expected npm pack to name an archive file");
  const path=join(directory,filename),digests=archiveDigests(path);
  assert.equal(digests.integrity,integrity,`npm pack integrity differs for ${name}`);
  return {name,path,...digests};
 });
}

export function verifyNativeConsumerArchives(consumer,lock,archives){
 for(const {name,path,sha256,integrity} of archives){
  const installed=lock.packages?.[`node_modules/${name}`];
  assert.ok(installed&&!installed.link&&installed.resolved?.startsWith("file:"),`Expected an installed archive entry for ${name}`);
  assert.equal(resolve(consumer,installed.resolved.slice(5)),path,`Installed archive path differs for ${name}`);
  assert.equal(installed.integrity,integrity,`Installed archive integrity differs for ${name}`);
  assert.deepEqual(archiveDigests(path),{sha256,integrity},`npm archive changed after packing ${name}`);
 }
}
