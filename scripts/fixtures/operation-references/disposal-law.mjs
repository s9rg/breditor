/** Collect callbacks only after actual fixture cleanup. fake-indexeddb retains
 * completed transaction handles while its factory is reachable; those are not
 * evidence of a retained editor read. Closed proof objects deliberately remain. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentDeliveryParticipant as OldParticipant} from '../../../packages/breditor-collaboration/dist/independent_operation/participant.js';
import {RestoredOperationParticipant as Participant} from '../../../packages/breditor-collaboration/dist/restored_participant/participant.js';
import {captureIndependentOperationBackup as captureOld} from '../../../packages/breditor-collaboration/dist/independent_operation/portable_capture.js';
import {captureRestoredGraph as captureGraph} from '../../../packages/breditor-collaboration/dist/restored_graph/capture.js';
import {captureIndependentOperationReferences} from '../../../packages/breditor-collaboration/dist/independent_operation/reference_capture.js';
import {captureRestoredGraphReferences} from '../../../packages/breditor-collaboration/dist/restored_graph/reference_capture.js';
import {environment} from '../room-participant-inventory/environment.mjs';
import {portableFixture} from '../independent-operation/portable.mjs';
import {readerRuntimeGraphFixture} from '../restored-graph/reader-runtime.mjs';
import {nativeProfile} from '../owned-core-cleanup/session.mjs';

export function verifyReferenceCallbackRelease(family,runtime,fixture){
 const output=execFileSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),'--reference-release-child',family,runtime,fixture],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
 const report=JSON.parse(output.trim());assert.equal(report.family,family);assert.equal(report.closedProofsIntentionallyKept,5);assert.equal(report.fixtureClosedBeforeCollection,true);assert.equal(report.readAuthorizationFunctionsRetained,0);assert.equal(report.normalWasmSha256,'b5061a35efb4a34804a925f4dc9d847904f6685b719dc99ff2f324223305e329');return report;
}
async function closedRead(capture,source,readOptions){const marker={read:'ended'},guard=function endedReferenceReadAuthorization(){assert.equal(marker.read,'ended');},weak=new WeakRef(guard),proof=await capture({source,...readOptions,checkAuthority:guard});proof.dispose();return{proof,weak};}
async function probe(family,runtime,fixture){
 assert.ok(['independent-delivery','restored-graph'].includes(family));assert.equal(typeof global.gc,'function');const wasm=readFileSync(runtime+'/breditor_shared_bg.wasm'),native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:wasm});const profile=nativeProfile(native,3,true),seed=JSON.parse(readFileSync(fixture)),reset=environment(),kept=[];let f,owner,parts,source,readOptions;
 try{
  if(family==='independent-delivery'){f=await portableFixture({api,rich,Participant:OldParticipant,profile,seed,tag:'reference-release-independent'});source=f.source;readOptions=f.readOptions;}
  else{f=await readerRuntimeGraphFixture({api,rich,OldParticipant,Participant,captureOld,capture:captureGraph,profile,seed,tag:'reference-release-graph'},'lineage-v2');owner=await Participant.begin(f.input.file(),f.options);await owner.finish();parts=await owner.intoParts();source=parts.source.session;readOptions=f.readOptions;}
  const capture=family==='independent-delivery'?captureIndependentOperationReferences:captureRestoredGraphReferences;for(let i=0;i<5;i++)kept.push(await closedRead(capture,source,readOptions));
  await parts?.source.session.discardAndClose();parts?.uploads.close();parts=undefined;await owner?.discardAndClose();owner=undefined;await f.close();f=undefined;source=undefined;readOptions=undefined;reset();
  for(let i=0;i<30;i++){await new Promise(resolve=>setImmediate(resolve));global.gc();}await new Promise(resolve=>setImmediate(resolve));
  const retained=kept.filter(row=>row.weak.deref()!==undefined).length,report={family,closedProofsIntentionallyKept:kept.length,fixtureClosedBeforeCollection:true,readAuthorizationFunctionsRetained:retained,normalWasmSha256:createHash('sha256').update(wasm).digest('hex')};console.log(JSON.stringify(report));assert.equal(retained,0,'Disposed reference handles must release read authority and captured recovery closures');for(const row of kept){assert.ok(row.proof.metadata().references.length);assert.throws(()=>row.proof.check());row.proof.dispose();}
 }finally{for(const row of kept)row.proof.dispose();await parts?.source.session.discardAndClose();parts?.uploads.close();await owner?.discardAndClose();await f?.close();profile.free();reset();}
}
if(process.argv[2]==='--reference-release-child')await probe(process.argv[3],process.argv[4],process.argv[5]);
