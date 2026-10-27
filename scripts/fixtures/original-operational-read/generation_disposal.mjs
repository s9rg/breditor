import {NORMAL_SHARED_WASM_SHA256} from "../native-runtime/normal-shared-identity.mjs";
/** Kept closed parent reports cannot retain historical/source or read-policy callbacks. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {captureGenerationOperationalRecords} from '../../../packages/breditor-collaboration/dist/generation_operation/operation.js';
import {nativeProfile} from '../owned-core-cleanup/session.mjs';
import {generationOperationalFixture} from './generation_session.mjs';
export function verifyGenerationParentReadRelease(runtime,family){const output=execFileSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),'--generation-parent-read-release',runtime,family],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024}),result=JSON.parse(output.trim());assert.equal(result.closedReportsIntentionallyKept,5);assert.equal(result.readCallbacksRetained,0);assert.equal(result.actualFixtureClosed,true);assert.equal(result.normalWasmSha256,NORMAL_SHARED_WASM_SHA256);return result;}
async function closedRead(f){const marker={read:'ended'},guard=function endedGenerationParentRead(){assert.equal(marker.read,'ended');},weak=new WeakRef(guard),read=await captureGenerationOperationalRecords(f.parent,guard),references=await read.captureReferences({restoreSegmented:s=>f.selected.options.restoreSegmented(s),checkAuthority:guard});read.dispose();assert.throws(()=>references.checkCurrent());return{read,references,weak};}
async function probe(runtime,family){
 assert.equal(typeof global.gc,'function');assert.ok(['generation','retained'].includes(family));const wasm=readFileSync(runtime+'/breditor_shared_bg.wasm'),native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:wasm});const profile=nativeProfile(native,3,true),kept=[];let f;
 try{f=await generationOperationalFixture({api,rich,profile,tag:'generation-parent-release',family});for(let i=0;i<5;i++)kept.push(await closedRead(f));await f.close();f=undefined;for(let i=0;i<30;i++){await new Promise(resolve=>setImmediate(resolve));global.gc();}await new Promise(resolve=>setImmediate(resolve));const result={family,closedReportsIntentionallyKept:kept.length,actualFixtureClosed:true,readCallbacksRetained:kept.filter(row=>row.weak.deref()!==undefined).length,normalWasmSha256:createHash('sha256').update(wasm).digest('hex')};console.log(JSON.stringify(result));assert.equal(result.readCallbacksRetained,0);for(const row of kept){assert.equal(row.read.metadata().format,'breditor/generation-operational-record-read');assert.throws(()=>row.read.files());assert.throws(()=>row.read.sources());}}
 finally{for(const row of kept)row.read.dispose();await f?.close();profile.free();}
}
if(process.argv[2]==='--generation-parent-read-release')await probe(process.argv[3],process.argv[4]);
