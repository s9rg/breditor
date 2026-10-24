/** Retain closed reports but not read authority after actual fixture teardown. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import {borrowPersistentSuggestionRecords as borrow} from '../../../packages/breditor-collaboration/dist/suggestions/queue.js';
import {nativeProfile} from '../owned-core-cleanup/session.mjs';
import {originalQueueFixture} from './session.mjs';
export function verifyPersistentSuggestionRelease(runtime,fixture){const output=execFileSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),'--persistent-read-release-child',runtime,fixture],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024}),result=JSON.parse(output.trim());assert.equal(result.closedReportsIntentionallyKept,5);assert.equal(result.readCallbacksRetained,0);assert.equal(result.actualFixtureClosed,true);assert.equal(result.normalWasmSha256,'b5061a35efb4a34804a925f4dc9d847904f6685b719dc99ff2f324223305e329');return result;}
async function closedRead(queue){const marker={read:'ended'},guard=function endedPersistentSuggestionRead(){assert.equal(marker.read,'ended');},weak=new WeakRef(guard),read=await borrow(queue,guard);read.dispose();return{read,weak};}
async function probe(runtime,fixture){
 assert.equal(typeof global.gc,'function');const wasm=readFileSync(runtime+'/breditor_shared_bg.wasm'),native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:wasm});const profile=nativeProfile(native,3,true),seed=JSON.parse(readFileSync(fixture)),kept=[];let f;
 try{f=await originalQueueFixture({api,profile,seed,tag:'persistent-suggestion-release'});for(let i=0;i<5;i++)kept.push(await closedRead(f.queue));await f.close();f=undefined;for(let i=0;i<30;i++){await new Promise(resolve=>setImmediate(resolve));global.gc();}await new Promise(resolve=>setImmediate(resolve));const result={closedReportsIntentionallyKept:kept.length,actualFixtureClosed:true,readCallbacksRetained:kept.filter(row=>row.weak.deref()!==undefined).length,normalWasmSha256:createHash('sha256').update(wasm).digest('hex')};console.log(JSON.stringify(result));assert.equal(result.readCallbacksRetained,0);for(const row of kept){assert.equal(row.read.metadata().format,'breditor/persistent-suggestion-record-read');assert.throws(()=>row.read.check());}}
 finally{for(const row of kept)row.read.dispose();await f?.close();profile.free();}
}
if(process.argv[2]==='--persistent-read-release-child')await probe(process.argv[3],process.argv[4]);
