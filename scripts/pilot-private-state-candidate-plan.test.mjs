import assert from "node:assert/strict";
import {chmod,copyFile,mkdir,mkdtemp,readFile,rm,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {test} from "node:test";
import {openPilotSessionReport,pilotArchiveNames} from "../experiments/shared-browser/pilot-session-report.mjs";

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


test("pilot session reports preserve reloads without carrying observations into a new candidate",()=>{
  const rows=new Map(),storage={getItem:key=>rows.get(key),setItem:(key,value)=>rows.set(key,value)};
  const identity={participant:"alice",endpoint:"ws://127.0.0.1:49784/ws",codeSha256:"a".repeat(64)};
  const candidate={frontendSha256:"b".repeat(64),relaySha256:"c".repeat(64),
    packages:pilotArchiveNames.map(name=>({name,version:"0.3.0-alpha.22",sha256:"f".repeat(64)}))};
  const legacy=openPilotSessionReport(identity,storage);
  legacy.record("disconnects");
  assert.equal(Object.hasOwn(legacy.snapshot(),"candidate"),false);
  const current=openPilotSessionReport({...identity,candidate},storage);
  assert.equal(current.snapshot().counts.disconnects,0);
  current.record("checkpointDownloads","d".repeat(64));
  current.record("savedReloads");
  const reordered={relaySha256:candidate.relaySha256,packages:[...candidate.packages].reverse(),frontendSha256:candidate.frontendSha256};
  const reopened=openPilotSessionReport({...identity,candidate:reordered},storage).snapshot();
  assert.deepEqual(reopened.candidate,candidate);
  assert.equal(reopened.counts.savedReloads,1);
  assert.equal(reopened.downloadedSha256,"d".repeat(64));
  const updated=openPilotSessionReport({...identity,candidate:{...candidate,frontendSha256:"e".repeat(64)}},storage).snapshot();
  assert.equal(updated.counts.savedReloads,0);
  assert.equal(updated.downloadedSha256,null);
  assert.equal(openPilotSessionReport(identity,storage).snapshot().counts.disconnects,1);
  for(const secret of [identity.endpoint,identity.codeSha256])assert.ok(!JSON.stringify(reopened).includes(secret));
  assert.throws(()=>openPilotSessionReport({...identity,candidate:{...candidate,localPath:"ignored"}},storage),/Invalid pilot candidate/);
  assert.throws(()=>openPilotSessionReport({...identity,candidate:{...candidate,packages:candidate.packages.map(row=>({...row,localPath:"ignored"}))}},storage),/Invalid pilot package identity/);
});
