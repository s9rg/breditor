/** Real release Wasm + SDK + temporary native relay. No existing demo or room is touched. */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdtempSync,realpathSync} from "node:fs";
import {createHash,randomBytes} from "node:crypto";
import {spawn} from "node:child_process";
import {createInterface} from "node:readline";
import {tmpdir} from "node:os";
import {resolve,join} from "node:path";
import {pathToFileURL,fileURLToPath} from "node:url";
import {WebSocket as NativeWebSocket} from "undici";
import {SharedRichEditor} from "../packages/breditor-collaboration/dist/core.js";
import {restoreSharedGeneralEditor} from "../packages/breditor-collaboration/dist/profile.js";
import {SharedRelaySync} from "../packages/breditor-collaboration/dist/relay/sync.js";
import {registerSharedRelayWriter} from "../packages/breditor-collaboration/dist/relay/registration.js";
import {coverageSeed,range} from "./fixtures/editor-consumer/coverage-seed.mjs";

const origin="http://127.0.0.1:49784",pause=ms=>new Promise(r=>setTimeout(r,ms));
const save=(path,value)=>writeFileSync(path,value,{mode:0o600});
async function eventually(test,label){const until=Date.now()+20_000;while(!test()){if(Date.now()>until)throw Error(`Timed out: ${label}`);await pause(25);}}
async function start(executable,args){
 const child=spawn(executable,args,{stdio:["ignore","pipe","pipe"]});let errors="";
 child.stderr.on("data",v=>{errors=(errors+v.toString()).slice(-16_384);});
 const closed=new Promise(resolve=>child.once("exit",(code,signal)=>resolve({code,signal}))),lines=createInterface({input:child.stdout});
 try{
  const address=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error("Relay startup timeout")),10_000);
   child.once("error",e=>{clearTimeout(timer);reject(e);});child.once("exit",()=>{clearTimeout(timer);reject(Error(`Relay exited before listening: ${errors}`));});
   lines.once("line",raw=>{clearTimeout(timer);try{const v=JSON.parse(raw);assert.equal(v.kind,"listening");resolve(v.address);}catch(e){reject(e);}});
  });
  return {address,async stop(){child.kill("SIGINT");const result=await Promise.race([closed,pause(10_000).then(()=>null)]);if(!result){child.kill("SIGTERM");throw Error("Functional relay did not stop promptly");}lines.close();assert.equal(result.code,0,errors);}};
 }catch(e){child.kill("SIGTERM");lines.close();throw e;}
}
function textIn(core,id){const visit=n=>{if(n.properties?.["breditor/block-id"]===id)return n.children.map(c=>c.text??"").join("");for(const c of n.children??[]){const found=visit(c);if(found!==undefined)return found;}};return visit(JSON.parse(core.documentJson()).root);}

export async function probeWriterTransportV2(directory,executable){
 const bytes=readFileSync(resolve(directory,"breditor_shared_bg.wasm")),wasm=await import(pathToFileURL(resolve(directory,"breditor_shared.js")));await wasm.default({module_or_path:bytes});
 const originalWebSocket=globalThis.WebSocket;
 globalThis.WebSocket=class extends NativeWebSocket{constructor(url){super(url,{headers:{Origin:origin}});}};
 let trials=0,restores=0,comparisons=0,flushes=0,modeRefusals=0;
 try{for(const natural of [false,true]){
  const path=mkdtempSync(join(tmpdir(),"breditor-transport-v2-")),schema={name:"example/transport-functional",version:1},configuration=JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema,extensions:[]}),profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(configuration);
  const tokens={alice:randomBytes(32).toString("hex"),bob:randomBytes(32).toString("hex")};
  const paths=["room.log","profile.json","document.json","auth.json"].map(n=>join(path,n));save(paths[1],configuration);save(paths[2],coverageSeed(JSON.parse(profile.descriptor_json())));save(paths[3],JSON.stringify({format:"breditor/relay-auth",formatVersion:1,origins:[origin],accounts:Object.entries(tokens).map(([principal,token])=>({principal,tokenHash:[...createHash("sha256").update(token).digest()]}))}));
  let host,a,b,sa,sb;
  try{
   host=await start(executable,[...paths,"127.0.0.1:0"]);const address=host.address,endpoint=`ws://${address}/ws`;
   await assert.rejects(registerSharedRelayWriter({endpoint,principal:"alice",room:"room",getToken:()=>tokens.alice,saveIdentity:()=>{throw Error("Wrong mode must not allocate a writer");}}),/invalid_request/);modeRefusals++;
   const registration=async principal=>registerSharedRelayWriter({endpoint,principal,room:"room",writerTransport:"atomic-v2",getToken:()=>tokens[principal],saveIdentity:id=>save(join(path,`${principal}.identity.json`),JSON.stringify(id))});
   const ar=await registration("alice"),br=await registration("bob");
   assert.equal(ar.identity.writerTransport,"atomic-v2");assert.equal(br.identity.writerTransport,"atomic-v2");
   a=new SharedRichEditor(profile.join_frame("room",ar.identity.writer,ar.frame));b=new SharedRichEditor(profile.join_frame("room",br.identity.writer,br.frame));for(const c of [a,b]){assert.equal(c.supportsWriterTransportV2(),true);c.enableGeneralRanges();if(natural)c.enableTypingHistory();}
   const initial=a.documentJson();assert.equal(initial,b.documentJson());
   // Author independently before networking: the partial-cell edit is the original packing repro.
   a.replaceGeneralRangePlainText(range("p-0-0",1,"p-1-1",3),"X🙂","atomic");
   a.insertGeneralParagraph(range("q1",1,"q2",2),"enter");
   a.select(range("head",0,"head",2));const clipboard=a.copyGeneral();assert.ok(clipboard);a.pasteGeneralInlineClipboard(range("z-intro",1),clipboard.richJson,"rich");
   b.select(range("p-2-3",1));b.type("PEER");
   const sync=(core,principal,id)=>new SharedRelaySync(core,{identity:id,getToken:()=>tokens[principal],autoConnect:false,persistLocal:async()=>save(join(path,`${principal}.journal.json`),core.checkpointJson())});
   sa=sync(a,"alice",ar.identity);sb=sync(b,"bob",br.identity);
   await sa.connect();await sa.flush();flushes++;await sb.connect();await sb.flush();flushes++;
   await eventually(()=>a.documentJson()===b.documentJson(),"initial two-writer convergence");comparisons++;
   const assertReceipt=(core,s)=>{const state=s.state(),clock=core.writerClockV2(state.writer);assert.equal(state.serverThrough,clock.through);assert.equal(state.serverPrefixDigest,clock.prefixDigest);};assertReceipt(a,sa);assertReceipt(b,sb);
   const edited=a.documentJson(),savedA=a.checkpointJson(),savedB=b.checkpointJson();
   sa.dispose();sb.dispose();sa=sb=undefined;a.dispose();b.dispose();a=b=undefined;
   await host.stop();host=undefined;host=await start(executable,[...paths,address]);
   a=new SharedRichEditor(restoreSharedGeneralEditor(profile,"room",savedA,natural?"typing-v1":"explicit"));b=new SharedRichEditor(restoreSharedGeneralEditor(profile,"room",savedB,natural?"typing-v1":"explicit"));assert.equal(a.checkpointJson(),savedA);assert.equal(b.checkpointJson(),savedB);restores+=2;
   sa=sync(a,"alice",ar.identity);sb=sync(b,"bob",br.identity);await sa.connect();await sb.connect();await sa.flush();await sb.flush();flushes+=2;
   assert.equal(a.documentJson(),edited);assert.equal(b.documentJson(),edited);comparisons++;
   for(const command of ["undo","undo","undo","redo","redo","redo"]){
    assert.equal(a[command](),true);await sa.flush();flushes++;await eventually(()=>a.documentJson()===b.documentJson(),command);assert.ok(textIn(a,"p-2-3").includes("PEER"));assertReceipt(a,sa);comparisons++;
   }
   assert.equal(a.documentJson(),edited);assert.equal(b.documentJson(),edited);trials++;
  }finally{sa?.dispose();sb?.dispose();a?.dispose();b?.dispose();if(host)await host.stop();profile.free();}
 }}finally{globalThis.WebSocket=originalWebSocket;}
 assert.equal(trials,2);assert.equal(restores,4);assert.equal(comparisons,16);assert.equal(flushes,20);assert.equal(modeRefusals,2);
 return {format:"breditor/writer-transport-v2-functional-probe",formatVersion:1,sharedWasmSha256:createHash("sha256").update(bytes).digest("hex"),nativeRelaySha256:createHash("sha256").update(readFileSync(executable)).digest("hex"),historyPolicies:2,exactJournalRestores:restores,twoWriterDocumentComparisons:comparisons,durableFlushes:flushes,wrongModeRegistrationRefusals:modeRefusals,passed:true,scope:"Actual release Wasm/SDK/native temporary loopback relay; offline cross-cell replacement, atomic general Enter and rich inline paste; two authors, peer-preserving selective Undo/Redo, host restart and exact general explicit/natural recovery. No browser/native clipboard/accessibility/deployment acceptance inferred."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected release shared Wasm directory and isolated functional host executable");console.log(JSON.stringify(await probeWriterTransportV2(...args),null,2));}
