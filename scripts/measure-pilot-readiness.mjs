/** Measure a fresh installed pilot and exact offline recovery using synthetic local accounts. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {createServer} from "node:net";
import {arch,cpus,platform,release,tmpdir,totalmem} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium,firefox,webkit} from "playwright";
import {saveEvidence,sourceEvidence} from "./candidate-release/evidence.mjs";
import {startNetworkDemo} from "./demo-shared-relay.mjs";

const args=process.argv.slice(2);
assert.ok(args.length===0||args.length===1&&/^[2-8]$/u.test(args[0]),
 "Usage: node scripts/measure-pilot-readiness.mjs [2–8 rounds per engine]");
const root=fileURLToPath(new URL("../",import.meta.url));
const source=sourceEvidence(root);
assert.ok(source.commit&&!source.dirty,"Check out one clean pilot candidate");
const rounds=Number(args[0]??3);
const directory=await mkdtemp(join(root,"target","pilot-readiness-"));
const output=join(directory,"result.json");
const cpu=cpus();
const result={format:"breditor/installed-pilot-readiness",formatVersion:1,source,
 host:{platform:platform(),architecture:arch(),release:release(),cpu:cpu[0]?.model??"unknown",logicalProcessors:cpu.length,memoryBytes:totalmem()},
 rounds,status:"running",samples:[]};
const save=()=>saveEvidence(output,result);
const sha256=value=>createHash("sha256").update(value).digest("hex");
const elapsed=start=>Math.round(performance.now()-start);
const openButton=page=>page.getByRole("button",{name:"Open editor",exact:true});
const controlsReady=page=>page.waitForFunction(()=>document.querySelector("#pilot-open")?.disabled===false);
const writerReady=(page,key)=>page.waitForFunction(key=>{
 const state=window.breditorNetworkDemo?.peers[key]?.sync.state();
 return state?.status==="ready"&&!state.pending&&state.serverThrough!==null;
},key);

async function unusedPort(){
 const server=createServer();
 await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
 const {port}=server.address();
 await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 return port;
}

async function signIn(page,participant,code){
 await page.getByLabel("Participant",{exact:true}).selectOption(participant);
 await page.getByLabel("Participant code").fill(code);
 await openButton(page).click();
 await page.getByRole("region",{name:"Shared document",exact:true}).waitFor();
}

async function typeAtStart(page,key,block,text){
 await page.bringToFront();
 await page.evaluate(({key,block})=>{
  const {mounted}=window.breditorNetworkDemo.peers[key];
  const point={block,offset:"0",affinity:"after"};
  mounted.surface.focus();
  mounted.select({kind:"text",anchor:point,focus:point});
 },{key,block});
 await page.keyboard.insertText(text);
 await page.waitForFunction(({block,text})=>document.querySelector(`[data-rich-text="${block}"]`)?.textContent.startsWith(text),{block,text});
}

async function measureRound(browser,engine,round){
 const state=await mkdtemp(join(tmpdir(),"breditor-measure-pilot-"));
 const sample={engine,version:browser.version(),round,phase:"launch"};
 result.samples.push(sample);
 let pilot,alice,bob;
 try{
  pilot=await startNetworkDemo({pilot:true,port:await unusedPort(),relayPort:0,directory:state});
  const response=await fetch(new URL("/pilot-bootstrap.json",pilot.url));
  assert.ok(response.ok,"Pilot bootstrap unavailable");
  const {candidate}=await response.json();
  assert.ok(candidate,"Measurement requires an installed pilot candidate");
  result.candidate??=candidate;
  assert.deepEqual(candidate,result.candidate,"Pilot inputs changed between samples");
  const codes=JSON.parse(await readFile(join(state,"accounts.json"),"utf8"));
  [alice,bob]=await Promise.all([browser.newContext(),browser.newContext()]);
  const [page,peer]=await Promise.all([alice.newPage(),bob.newPage()]);
  const routes=new Set(),origin=new URL(pilot.url).origin;
  page.on("request",request=>{
   const url=new URL(request.url());
   if(url.origin===origin)routes.add(url.pathname);
  });
  sample.phase="startup";
  let start=performance.now();
  await page.goto(pilot.url,{waitUntil:"commit"});
  await controlsReady(page);
  sample.startup={milliseconds:elapsed(start),httpRoutes:routes.size};

  sample.phase="offline-edit";
  await signIn(page,"alice",codes.alice);
  await writerReady(page,"a");
  await peer.goto(pilot.url);
  await controlsReady(peer);
  await signIn(peer,"bob",codes.bob);
  await writerReady(peer,"b");
  await page.getByRole("button",{name:"Go offline",exact:true}).click();
  await page.evaluate(()=>window.breditorNetworkDemo.peers.a.sync.waitForDisconnected());
  await page.waitForFunction(()=>window.breditorNetworkDemo.peers.a.sync.state().status==="offline");
  const aliceText="Pilot offline note. ",bobText="Pilot peer evidence. ";
  await typeAtStart(page,"a","pilot-notes",aliceText);
  await typeAtStart(peer,"b","pilot-item",bobText);
  await peer.evaluate(async()=>{
   const {session,sync}=window.breditorNetworkDemo.peers.b;
   await session.flush();
   await sync.flush();
  });
  await writerReady(peer,"b");

  sample.phase="saved-reload";
  const reload=page.getByRole("button",{name:"Save and reload",exact:true});
  await page.bringToFront();
  await reload.focus();
  const checkpoint=await page.evaluate(async()=>{
   const {session}=window.breditorNetworkDemo.peers.a;
   await session.flush();
   return session.core.checkpointJson();
  });
  routes.clear();
  start=performance.now();
  await reload.click();
  await openButton(page).waitFor();
  await controlsReady(page);
  sample.savedReload={milliseconds:elapsed(start),httpRoutes:routes.size};
  await signIn(page,"alice",codes.alice);
  await page.waitForFunction(()=>document.querySelector("#state-a")?.textContent.includes("offline"));
  const reopened=await page.evaluate(()=>window.breditorNetworkDemo.peers.a.session.core.checkpointJson());
  if(reopened!==checkpoint){
   sample.expectedCheckpointSha256=sha256(checkpoint);
   sample.reopenedCheckpointSha256=sha256(reopened);
   const before=JSON.parse(checkpoint),after=JSON.parse(reopened);
   sample.changedCheckpointFields=[...new Set([...Object.keys(before),...Object.keys(after)])]
    .filter(key=>JSON.stringify(before[key])!==JSON.stringify(after[key]));
   throw Error("Saved reload changed the native checkpoint");
  }

  sample.phase="reconnect";
  start=performance.now();
  await page.getByRole("button",{name:"Reconnect",exact:true}).click();
  await Promise.all([[page,"a"],[peer,"b"]].map(([tab,key])=>tab.waitForFunction(({key,aliceText,bobText})=>{
   const {session,sync}=window.breditorNetworkDemo.peers[key],state=sync.state();
   const document=session.core.documentJson();
   return state.status==="ready"&&!state.pending&&document.includes(aliceText)&&document.includes(bobText);
  },{key,aliceText,bobText})));
  sample.reconnectMilliseconds=elapsed(start);
  sample.checkpointSha256=sha256(checkpoint);
  const a=await page.evaluate(()=>window.breditorNetworkDemo.peers.a.session.core.documentJson());
  const b=await peer.evaluate(()=>window.breditorNetworkDemo.peers.b.session.core.documentJson());
  assert.equal(a,b,"Reconnect did not converge to the same native document");
  sample.documentSha256=sha256(a);
  sample.phase="complete";
 }finally{
  try{await Promise.all([alice?.close(),bob?.close()]);}
  finally{try{await pilot?.stop();}finally{await rm(state,{recursive:true,force:true});}}
 }
}

save();
try{
 for(const engine of [chromium,firefox,webkit]){
  const browser=await engine.launch({headless:true});
  try{for(let round=1;round<=rounds;round++){await measureRound(browser,engine.name(),round);save();}}
  finally{await browser.close();}
 }
 assert.deepEqual(sourceEvidence(root),source,"Pilot source changed during measurement");
 result.status="passed";
}catch(error){
 result.status="failed";
 const latest=result.samples.at(-1);
 console.error(`Pilot measurement failed in ${latest?.engine??"setup"}, phase ${latest?.phase??"startup"} (${error.name}).`);
 process.exitCode=1;
}finally{
 save();
 console.log(`Pilot readiness evidence: ${output}`);
}
