// Real local launcher proof. Owned temporary state only; no browser or global setting changes.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createServer} from "node:net";
import {mkdtemp,readFile,rm,stat} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {startNetworkDemo} from "../../scripts/demo-shared-relay.mjs";
async function unusedPort(){const server=createServer();await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
test("loopback demo launcher retains exact room and private accounts through a real process restart",{timeout:40_000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),"breditor-network-demo-host-")),port=await unusedPort();let demo;
 try{
  demo=await startNetworkDemo({port,relayPort:0,directory});
  const response=await fetch(demo.url);assert.equal(response.status,200);assert.match(await response.text(),/Local developer accounts only/);
  assert.equal((await fetch(`${demo.url}?peer=alice`)).status,200);
  assert.equal((await fetch(new URL("/pilot-entry.mjs",demo.url))).status,404);
  const bootstrap=await(await fetch(`http://127.0.0.1:${port}/relay-bootstrap.json`)).json();assert.equal(bootstrap.endpoint,demo.endpoint);assert.deepEqual(Object.keys(bootstrap.tokens).sort(),["alice","bob"]);
  const room=await readFile(join(directory,"room.log")),accounts=await readFile(join(directory,"accounts.json"));
  assert.equal((await stat(join(directory,"accounts.json"))).mode&0o777,0o600);
  await demo.stop();demo=await startNetworkDemo({port,relayPort:0,directory});
  assert.deepEqual(await readFile(join(directory,"room.log")),room);assert.deepEqual(await readFile(join(directory,"accounts.json")),accounts);
  const next=await(await fetch(`http://127.0.0.1:${port}/relay-bootstrap.json`)).json();assert.deepEqual(next.tokens,bootstrap.tokens);
 }finally{await demo?.stop();await rm(directory,{recursive:true,force:true});}
});


test("pilot launcher identifies the served candidate without exposing local inputs",{timeout:40_000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),"breditor-pilot-candidate-host-")),port=await unusedPort();
 const url=`http://127.0.0.1:${port}/pilot-bootstrap.json`;
 const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
 let demo;
 try{
  demo=await startNetworkDemo({pilot:true,port,relayPort:0,directory});
  const html=await(await fetch(demo.url)).text();
  assert.match(html,/<script type="module" src="\/pilot-entry\.mjs"><\/script>/u);
  const entry=await fetch(new URL("/pilot-entry.mjs",url));
  assert.equal(entry.status,200);
  assert.match(entry.headers.get("content-type"),/^text\/javascript/u);
  const code=await entry.text();
  assert.match(code,/pilot-bootstrap\.json/u);
  const chunks=[...new Set(code.match(/pilot-chunk-[a-z0-9_-]+\.mjs/giu))];
  assert.ok(chunks.length>0);
  for(const chunk of chunks){
   const response=await fetch(new URL(`/${chunk}`,url));
   assert.equal(response.status,200);
   assert.match(response.headers.get("content-type"),/^text\/javascript/u);
  }
  const response=await fetch(url),raw=await response.text();
  assert.equal(response.status,200);
  const {candidate,endpoint,...settings}=JSON.parse(raw);
  assert.equal(endpoint,demo.endpoint);
  assert.deepEqual(Object.keys(settings).sort(),["configuration","format","formatVersion"]);
  assert.deepEqual(Object.keys(candidate).sort(),["frontendSha256","packages","relaySha256"]);
  assert.match(candidate.frontendSha256,/^[0-9a-f]{64}$/u);
  const {archives,archiveEvidence,consumer}=JSON.parse(await readFile(new URL("../../target/editor-installed-consumer.json",import.meta.url),"utf8"));
  const wasmFile="breditor_shared_bg.wasm";
  const wasm=await fetch(new URL(`/${wasmFile}`,url));
  assert.equal(wasm.status,200);
  assert.equal(wasm.headers.get("content-type"),"application/wasm");
  assert.equal(sha256(Buffer.from(await wasm.arrayBuffer())),sha256(await readFile(join(consumer,"node_modules/@breditor/collaboration/dist/runtime",wasmFile))));
  assert.equal(candidate.packages.length,4);
  assert.deepEqual(candidate.packages,await Promise.all(archiveEvidence.map(async({name,version},index)=>({name,version,sha256:sha256(await readFile(archives[index]))}))));
  assert.equal(candidate.relaySha256,sha256(await readFile(new URL("../../target/relay-native/debug/examples/network_demo",import.meta.url))));
  const codes=JSON.parse(await readFile(join(directory,"accounts.json"),"utf8"));
  for(const value of [...Object.values(codes),...archives,directory])assert.ok(!raw.includes(value));
  assert.equal((await fetch(new URL("/relay-bootstrap.json",url))).status,404);
  await demo.stop();
  demo=await startNetworkDemo({pilot:true,port,relayPort:0,directory});
  assert.deepEqual((await(await fetch(url)).json()).candidate,candidate);
 }finally{await demo?.stop();await rm(directory,{recursive:true,force:true});}
});
