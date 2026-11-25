import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {sourceEvidence} from "./candidate-release/evidence.mjs";
import {
 interchangeConsumerLockEvidence,interchangeConsumerPackages,verifyInterchangeConsumerReuse,
} from "./interchange-consumer-lock.mjs";

test("mixed workflow reuse requires the current exact interchange install",t=>{
 const directory=mkdtempSync(join(tmpdir(),"breditor-interchange-lock-"));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const root=join(directory,"source"),consumer=join(directory,"consumer"),archiveDirectory=join(directory,"archives");
 for(const path of [root,consumer,archiveDirectory])mkdirSync(path);
 const registryPath="node_modules/parse5";
 const registry={version:"8.0.1",resolved:"https://registry.npmjs.org/parse5/-/parse5-8.0.1.tgz",integrity:"sha512-pinned"};
 const producer={lockfileVersion:3,packages:{[registryPath]:registry}};
 writeFileSync(join(root,"package-lock.json"),JSON.stringify(producer));
 const git=(...args)=>execFileSync("git",args,{cwd:root,stdio:"ignore"});
 git("init","-q");
 git("add","package-lock.json");
 git("-c","user.name=Fixture","-c","user.email=fixture@example.test","commit","-qm","Lock source");
 const lock=structuredClone(producer);
 const archives=interchangeConsumerPackages.map(name=>{
  const filename=`breditor-${name.split("/")[1]}.tgz`,path=join(archiveDirectory,filename),version="1.0.0",integrity="sha512-local";
  writeFileSync(path,name);
  lock.packages[`node_modules/${name}`]={version,integrity,resolved:`file:../archives/${filename}`};
  return {name,filename,path,version,integrity};
 });
 const write=contents=>writeFileSync(join(consumer,"package-lock.json"),contents);
 write(JSON.stringify(lock));
 const report={format:"breditor/interchange-installed-consumer",formatVersion:1,passed:true,source:sourceEvidence(root),
  consumer,archives,...interchangeConsumerLockEvidence(root,consumer,archives)};
 verifyInterchangeConsumerReuse(root,report);
 assert.throws(()=>verifyInterchangeConsumerReuse(root,{...report,archives:[]}),/archive inventory differs/);
 assert.throws(()=>verifyInterchangeConsumerReuse(root,{...report,source:{...report.source,commit:"0".repeat(40)}}),
  /belongs to another candidate/);
 write(JSON.stringify(lock,null,2));
 assert.throws(()=>verifyInterchangeConsumerReuse(root,report),/consumer lock changed since qualification/);
 lock.packages[registryPath].version="8.0.2";
 write(JSON.stringify(lock));
 assert.throws(()=>verifyInterchangeConsumerReuse(root,report),/registry artifact drifted/);
});
