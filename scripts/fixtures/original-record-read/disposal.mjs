import {NORMAL_SHARED_WASM_SHA256} from "../native-runtime/normal-shared-identity.mjs";
/** Disposed typed data reports may be retained without retaining read authority. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import {captureOriginalNativeRecords} from '../../../packages/breditor-collaboration/dist/persistence/shared_session.js';
import {captureOriginalVersionRecords} from '../../../packages/breditor-collaboration/dist/versions/catalog.js';
import {captureOriginalRevisionRecords} from '../../../packages/breditor-collaboration/dist/suggestion_revisions/outbox.js';
import {nativeProfile} from '../owned-core-cleanup/session.mjs';
import {originalNativeFixture,originalStoresFixture} from './session.mjs';
export function verifyOriginalRecordReadRelease(runtime,fixture,family){const output=execFileSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),'--original-retained-read-release-child',runtime,fixture,family],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024}),result=JSON.parse(output.trim());assert.equal(result.closedReportsIntentionallyKept,5);assert.equal(result.readCallbacksRetained,0);assert.equal(result.actualFixtureClosed,true);assert.equal(result.normalWasmSha256,NORMAL_SHARED_WASM_SHA256);return result;}
async function closedRead(f,family){const marker={read:'ended'},guard=function endedOriginalRecordRead(){assert.equal(marker.read,'ended');},weak=new WeakRef(guard),read=await(family==='native'?captureOriginalNativeRecords(f.source,guard):family==='version'?captureOriginalVersionRecords(f.versions,guard):captureOriginalRevisionRecords(f.outbox,guard));read.dispose();return{read,weak};}
async function probe(runtime,fixture,family){
 assert.equal(typeof global.gc,'function');assert.ok(['native','version','revision'].includes(family));const wasm=readFileSync(runtime+'/breditor_shared_bg.wasm'),native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:wasm});const profile=nativeProfile(native,3,true),seed=JSON.parse(readFileSync(fixture)),kept=[];let f;
 try{f=family==='native'?await originalNativeFixture({api,profile,tag:'original-native-release',scope:2,mask:5}):await originalStoresFixture({api,profile,seed,tag:'original-'+family+'-release',versions:family==='version',revisions:family==='revision'});for(let i=0;i<5;i++)kept.push(await closedRead(f,family));await f.close();f=undefined;for(let i=0;i<30;i++){await new Promise(resolve=>setImmediate(resolve));global.gc();}await new Promise(resolve=>setImmediate(resolve));const result={family,closedReportsIntentionallyKept:kept.length,actualFixtureClosed:true,readCallbacksRetained:kept.filter(row=>row.weak.deref()!==undefined).length,normalWasmSha256:createHash('sha256').update(wasm).digest('hex')};console.log(JSON.stringify(result));assert.equal(result.readCallbacksRetained,0);for(const row of kept){assert.match(row.read.metadata().format,/^breditor\/persistent-original-/);assert.throws(()=>row.read.check());}}
 finally{for(const row of kept)row.read.dispose();await f?.close();profile.free();}
}
if(process.argv[2]==='--original-retained-read-release-child')await probe(process.argv[3],process.argv[4],process.argv[5]);
