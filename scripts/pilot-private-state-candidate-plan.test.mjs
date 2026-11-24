import assert from "node:assert/strict";
import {chmod,copyFile,mkdir,mkdtemp,readFile,rm,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {test} from "node:test";

async function pilotFixture(t) {
  const root=await mkdtemp(join(tmpdir(),"breditor-pilot-state-"));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const state=join(root,"state");
  await Promise.all([
    mkdir(join(root,"scripts")),
    mkdir(join(root,"target","collaboration-feasibility-web"),{recursive:true}),
    mkdir(join(root,"experiments","shared-browser"),{recursive:true}),
    mkdir(state,{mode:0o700}),
  ]);
  const launcher=join(root,"scripts","demo-shared-relay.mjs");
  await Promise.all([
    copyFile(new URL("./demo-shared-relay.mjs",import.meta.url),launcher),
    writeFile(join(root,"target","editor-installed-consumer.json"),"{}"),
    writeFile(join(root,"target","collaboration-feasibility-web","native-vector.json"),JSON.stringify({
      shared_profile:{configuration:{},input:"{}"},
    })),
    writeFile(join(root,"experiments","shared-browser","pilot-root.json"),"{}"),
  ]);
  const {startNetworkDemo}=await import(pathToFileURL(launcher).href);
  return {root,state,start:()=>startNetworkDemo({pilot:true,directory:state})};
}

for(const name of ["accounts.json","server-auth.json","browser-bootstrap.json"]){
  test(`pilot refuses a symlinked ${name} and keeps its target intact`,{skip:process.platform==="win32"},async t=>{
    const {root,state,start}=await pilotFixture(t);
    const target=join(root,"untouched.json"),raw=JSON.stringify({alice:"a".repeat(64),bob:"b".repeat(64)});
    await writeFile(target,raw,{mode:0o600});
    await symlink(target,join(state,name));
    const failure=await start().then(async demo=>{await demo.stop();return null;},error=>error);
    assert.equal(await readFile(target,"utf8"),raw);
    assert.equal(failure?.message,`Use a private regular pilot state file for ${name}`);
  });
}

test("pilot refuses an existing state file with group or public permissions",{skip:process.platform==="win32"},async t=>{
  const {state,start}=await pilotFixture(t);
  const account=join(state,"accounts.json"),raw=JSON.stringify({alice:"a".repeat(64),bob:"b".repeat(64)});
  await writeFile(account,raw,{mode:0o600});
  await chmod(account,0o640);
  await assert.rejects(start(),/Use a private regular pilot state file for accounts\.json/);
  assert.equal(await readFile(account,"utf8"),raw);
});
