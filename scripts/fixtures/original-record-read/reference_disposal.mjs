import {NORMAL_SHARED_WASM_SHA256} from "../native-runtime/normal-shared-identity.mjs";
/** Kept reference reports must not retain read authorization or temporary native replays. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import {captureOriginalRecordReferences} from '../../../packages/breditor-collaboration/dist/persistence/original_record_reference_capture.js';
import {nativeProfile} from '../owned-core-cleanup/session.mjs';
import {originalStoresFixture} from '../original-record-read/session.mjs';
export function verifyOriginalReferenceRelease(runtime,fixture,family){const output=execFileSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),'--original-reference-release-child',runtime,fixture,family],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024}),result=JSON.parse(output.trim());assert.equal(result.closedReportsIntentionallyKept,5);assert.equal(result.readCallbacksRetained,0);assert.equal(result.actualFixtureClosed,true);assert.equal(result.normalWasmSha256,NORMAL_SHARED_WASM_SHA256);return result;}
async function closedRead(f,profile){const marker={read:'ended'},guard=function endedOriginalReferenceRead(){assert.equal(marker.read,'ended');},weak=new WeakRef(guard),read=await captureOriginalRecordReferences({source:f.source,restore:s=>profile.restore_document('room',s),...(f.versions?{versions:f.versions}:{}),...(f.outbox?{revisions:f.outbox}:{suggestions:f.queue}),checkAuthority:guard});read.dispose();return{read,weak};}
async function probe(runtime,fixture,family){
 assert.equal(typeof global.gc,'function');assert.ok(['paired','stores'].includes(family));const wasm=readFileSync(runtime+'/breditor_shared_bg.wasm'),native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:wasm});const profile=nativeProfile(native,3,true),seed=JSON.parse(readFileSync(fixture)),kept=[];let f;
 try{f=await originalStoresFixture({api,profile,seed,tag:'original-reference-release',versions:family==='stores',revisions:family==='stores'});for(let i=0;i<5;i++)kept.push(await closedRead(f,profile));await f.close();f=undefined;for(let i=0;i<30;i++){await new Promise(resolve=>setImmediate(resolve));global.gc();}await new Promise(resolve=>setImmediate(resolve));const result={family,closedReportsIntentionallyKept:kept.length,actualFixtureClosed:true,readCallbacksRetained:kept.filter(row=>row.weak.deref()!==undefined).length,normalWasmSha256:createHash('sha256').update(wasm).digest('hex')};console.log(JSON.stringify(result));assert.equal(result.readCallbacksRetained,0);for(const row of kept){assert.equal(row.read.metadata().format,'breditor/original-record-reference-capture');assert.throws(()=>row.read.check());}}
 finally{for(const row of kept)row.read.dispose();await f?.close();profile.free();}
}
if(process.argv[2]==='--original-reference-release-child')await probe(process.argv[3],process.argv[4],process.argv[5]);
