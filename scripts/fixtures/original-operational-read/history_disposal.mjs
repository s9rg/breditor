import {NORMAL_SHARED_WASM_SHA256} from "../native-runtime/normal-shared-identity.mjs";
/** Closed complete-history reports must release both parent and source scopes. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {captureOriginalOperationalHistoryReferences as original} from '../../../packages/breditor-collaboration/dist/participant_operation/operation.js';
import {captureGenerationOperationalHistoryReferences as generation} from '../../../packages/breditor-collaboration/dist/generation_operation/operation.js';
import {nativeProfile} from '../owned-core-cleanup/session.mjs';
import {originalOperationalFixture} from './session.mjs';
import {generationOperationalFixture} from './generation_session.mjs';
export function verifyOperationalHistoryRelease(runtime,family){const output=execFileSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),'--operational-history-release',runtime,family],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024}),result=JSON.parse(output.trim());assert.equal(result.closedReportsIntentionallyKept,5);assert.equal(result.readCallbacksRetained,0);assert.equal(result.actualFixtureClosed,true);assert.equal(result.normalWasmSha256,NORMAL_SHARED_WASM_SHA256);return result;}
async function closedRead(f,family){const marker={read:'ended'},guard=function endedOperationalHistoryRead(){assert.equal(marker.read,'ended');},weak=new WeakRef(guard),read=await(family==='original'?original:generation)(f.parent,{...(family==='original'?{restore:s=>f.selected.restore(s)}:{restoreSegmented:s=>f.selected.options.restoreSegmented(s)}),checkAuthority:guard});read.dispose();return{read,weak};}
async function probe(runtime,family){
 assert.equal(typeof global.gc,'function');assert.ok(['original','retained'].includes(family));const wasm=readFileSync(runtime+'/breditor_shared_bg.wasm'),native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:wasm});const profile=nativeProfile(native,3,true),kept=[];let f;
 try{f=await(family==='original'?originalOperationalFixture:generationOperationalFixture)({api,rich,profile,tag:'operational-history-release',family,retained:true});for(let i=0;i<5;i++)kept.push(await closedRead(f,family));await f.close();f=undefined;for(let i=0;i<30;i++){await new Promise(resolve=>setImmediate(resolve));global.gc();}await new Promise(resolve=>setImmediate(resolve));const result={family,closedReportsIntentionallyKept:kept.length,actualFixtureClosed:true,readCallbacksRetained:kept.filter(row=>row.weak.deref()!==undefined).length,normalWasmSha256:createHash('sha256').update(wasm).digest('hex')};console.log(JSON.stringify(result));assert.equal(result.readCallbacksRetained,0);for(const row of kept){assert.equal(row.read.metadata().format,'breditor/operational-history-reference-read');assert.throws(()=>row.read.checkCurrent());assert.equal('sources'in row.read,false);}}
 finally{for(const row of kept)row.read.dispose();await f?.close();profile.free();}
}
if(process.argv[2]==='--operational-history-release')await probe(process.argv[3],process.argv[4]);
