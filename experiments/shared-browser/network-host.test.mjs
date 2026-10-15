// Real local launcher proof. Owned temporary state only; no browser or global setting changes.
import {test} from "node:test";
import assert from "node:assert/strict";
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
  const bootstrap=await(await fetch(`http://127.0.0.1:${port}/relay-bootstrap.json`)).json();assert.equal(bootstrap.endpoint,demo.endpoint);assert.deepEqual(Object.keys(bootstrap.tokens).sort(),["alice","bob"]);
  const room=await readFile(join(directory,"room.log")),accounts=await readFile(join(directory,"accounts.json"));
  assert.equal((await stat(join(directory,"accounts.json"))).mode&0o777,0o600);
  await demo.stop();demo=await startNetworkDemo({port,relayPort:0,directory});
  assert.deepEqual(await readFile(join(directory,"room.log")),room);assert.deepEqual(await readFile(join(directory,"accounts.json")),accounts);
  const next=await(await fetch(`http://127.0.0.1:${port}/relay-bootstrap.json`)).json();assert.deepEqual(next.tokens,bootstrap.tokens);
 }finally{await demo?.stop();await rm(directory,{recursive:true,force:true});}
});
