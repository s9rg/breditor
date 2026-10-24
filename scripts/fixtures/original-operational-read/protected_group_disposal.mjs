/** Intentionally retained closed group reports carry no callback or factory. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {reserveProtectedOperationalHistoryRead as reserve} from '../../../packages/breditor-collaboration/dist/operation_read/protected_history_group.js';
import {nativeProfile} from '../owned-core-cleanup/session.mjs';
import {protectedHistoryGroupFixture} from './protected_group_session.mjs';
export function verifyProtectedGroupRelease(runtime,mode){const output=execFileSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),'--protected-group-release',runtime,mode],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024}),result=JSON.parse(output.trim());assert.equal(result.closedReportsIntentionallyKept,5);assert.equal(result.readCallbacksRetained,0);assert.equal(result.restoreFactoriesRetained,0);assert.equal(result.actualFixtureClosed,true);assert.equal(result.normalWasmSha256,'b5061a35efb4a34804a925f4dc9d847904f6685b719dc99ff2f324223305e329');return result;}
async function closedRead(f,mode){const marker={read:'ended'},guard=function endedProtectedGroupRead(){assert.equal(marker.read,'ended');},restore=function endedProtectedGroupFactory(checkpoint){assert.equal(marker.read,'ended');return f.rows[0].read.restore(checkpoint);},weak=new WeakRef(guard),factory=new WeakRef(restore),read=reserve([{...f.rows[0],read:{restore}},f.rows[1]],guard);if(mode==='prepared')await read.prepare();read.close();return{read,weak,factory};}
async function probe(runtime,mode){assert.equal(typeof global.gc,'function');assert.ok(['prepared','unprepared'].includes(mode));const wasm=readFileSync(runtime+'/breditor_shared_bg.wasm'),native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:wasm});const profile=nativeProfile(native,3,true),kept=[];let f;
 try{f=await protectedHistoryGroupFixture({api,rich,profile,tag:'protected-group-release'});for(let i=0;i<5;i++)kept.push(await closedRead(f,mode));await f.close();f=undefined;for(let i=0;i<30;i++){await new Promise(resolve=>setImmediate(resolve));global.gc();}await new Promise(resolve=>setImmediate(resolve));const result={mode,closedReportsIntentionallyKept:kept.length,actualFixtureClosed:true,readCallbacksRetained:kept.filter(row=>row.weak.deref()!==undefined).length,restoreFactoriesRetained:kept.filter(row=>row.factory.deref()!==undefined).length,normalWasmSha256:createHash('sha256').update(wasm).digest('hex')};console.log(JSON.stringify(result));assert.equal(result.readCallbacksRetained,0);assert.equal(result.restoreFactoriesRetained,0);for(const row of kept){assert.throws(()=>row.read.checkCurrent());if(mode==='prepared')assert.equal(row.read.metadata().format,'breditor/protected-operational-history-group-read');else assert.throws(()=>row.read.metadata());}}
 finally{for(const row of kept)row.read.close();await f?.close();profile.free();}}
if(process.argv[2]==='--protected-group-release')await probe(process.argv[3],process.argv[4]);
