import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {lstatSync,readFileSync} from "node:fs";
import {resolve} from "node:path";

/** Verify and identify the exact archives selected for installation. */
export function installedArchiveDigests(directory,packs,names){
 assert.ok(Array.isArray(packs)&&packs.length===names.length,"Unexpected npm pack inventory");
 const byName=new Map(packs.map(pack=>[pack.name,pack]));
 assert.equal(byName.size,names.length,"Duplicate package in npm pack inventory");
 assert.equal(new Set(packs.map(pack=>pack.filename)).size,names.length,"Duplicate npm archive filename");
 return names.map(name=>{
  const pack=byName.get(name);
  assert.ok(pack,`Missing packed workspace: ${name}`);
  const {filename,version,size,integrity}=pack;
  assert.match(filename,/^[a-z0-9][a-z0-9+._-]*\.tgz$/,"Invalid npm archive filename");
  assert.match(version,/^[0-9][0-9A-Za-z+.-]*$/,"Invalid packed workspace version");
  const path=resolve(directory,filename);
  assert.ok(lstatSync(path).isFile(),`Archive must be a regular file: ${filename}`);
  const bytes=readFileSync(path);
  assert.ok(bytes.length>0,`Empty npm archive: ${filename}`);
  assert.equal(bytes.length,size,`Archive size changed: ${filename}`);
  const actualIntegrity="sha512-"+createHash("sha512").update(bytes).digest("base64");
  assert.equal(actualIntegrity,integrity,`Archive integrity changed: ${filename}`);
  return {name,version,filename,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),integrity};
 });
}
