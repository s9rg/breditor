import test from 'node:test';import assert from 'node:assert/strict';
import {families,heldMetadataSession} from './fixtures/held-metadata/session.mjs';import {prepareCompoundMetadata} from '../packages/breditor-collaboration/dist/metadata/compound_preparation.js';
import {RelayWorkCustody} from '../packages/breditor-collaboration/dist/relay/work_custody.js';import {nativeRecoveryWorkAdmission} from '../packages/breditor-collaboration/dist/native_recovery/work_admission.js';
const pause=()=>new Promise(resolve=>setImmediate(resolve)),busy=e=>e?.code==='native_recovery_busy';
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
for(const family of families){
 test(family.name+': closing during an actual version lock request drains late work and retains prepared queue/revision children',{timeout:120000},async()=>heldMetadataSession({family},async f=>{
  const locks=navigator.locks,request=locks.request,entered=deferred(),release=deferred();let once=true;
  locks.request=async function(name,...args){if(once&&name.startsWith('breditor:version-catalog:')){once=false;entered.resolve();await release.promise;}return request.call(this,name,...args);};
  const opening=f.prepare();void opening.catch(()=>{});let ending;
  try{await entered.promise;await assert.rejects(f.prepare(),e=>e.code==='metadata_preparation_busy');let closed=false;ending=f.context.close().then(()=>{closed=true;});await pause();assert.equal(closed,false);assert.throws(()=>f.hold.close(),busy);assert.throws(()=>f.source.core.select(null),busy);release.resolve();await assert.rejects(opening);await ending;assert.equal(closed,true);assert.deepEqual(f.recovery(),f.before);
   await f.renewContext();const parts=await f.prepare();assert.deepEqual(parts.versions.exportRecovery(),f.before.retained.versions);assert.deepEqual(parts.suggestions.exportRecovery(),f.before.retained.suggestions);assert.deepEqual(parts.revisions.exportRecovery(),f.before.retained.revisions);f.evidence();await f.finish();
  }finally{release.resolve();await opening.catch(()=>{});await ending;locks.request=request;}
 }));
 test(family.name+': ordinary opens refuse before lock callbacks and completed no-write children do not grant ordinary work',{timeout:120000},async()=>heldMetadataSession({family},async f=>{
  const locks=navigator.locks,request=locks.request;let calls=0;locks.request=function(...args){calls++;return request.apply(this,args);};
  try{await assert.rejects(f.source.openVersionCatalog({getToken:()=>{throw Error('No token');},autoConnect:false}),e=>['version_recovery_in_use','suggestion_recovery_in_use'].includes(e.code));await assert.rejects(f.source.openSuggestionQueue(),e=>e.code==='suggestion_recovery_in_use');assert.equal(calls,0);
   const grant=nativeRecoveryWorkAdmission(f.hold,f.source.core),fail=()=>Error('ordinary held work remains excluded'),work=RelayWorkCustody.ordinaryDuringRecovery(f.source.core,()=>true,fail,grant);assert.throws(()=>work.runSync(()=>1));assert.throws(()=>RelayWorkCustody.ordinaryDuringRecovery(f.source.core,()=>true,fail,{...grant}));
   const parts=await f.prepare();await f.closeContext();assert.throws(()=>parts.suggestions.queueDecision('0'.repeat(64),'accept','9'));assert.throws(()=>work.runSync(()=>1));f.hold.close();assert.equal(work.runSync(()=>7),7);work.retire(()=>{});const draft=text=>({scope:'commands',edit:{kind:'commands',data:[{kind:'insert_text',data:{block:'p',offset:0,text}}]}}),version=parts.versions.saveVersion('After explicit hold release','10'),proposal=parts.suggestions.propose('After explicit hold release','11',draft('Later proposal ')),revision=parts.revisions.revise({previousSuggestionId:proposal.id,title:'Later revision',createdAtMs:'12',draft:draft('Later revision ')});await parts.versions.flush();await parts.suggestions.flush();await parts.revisions.flush();assert.ok(parts.versions.versionPacket(version.id));assert.ok(parts.revisions.packet(revision.id));f.evidence();await f.finish();
  }finally{locks.request=request;}
 }));
 test(family.name+': current authority refusal retains exact records and a fresh context can prepare without unlocking editing',{timeout:120000},async()=>heldMetadataSession({family},async f=>{
  f.authorize(false);await assert.rejects(f.prepare());assert.deepEqual(f.recovery(),f.before);f.authorize(true);const parts=await f.prepare();assert.deepEqual(parts.versions.exportRecovery(),f.before.retained.versions);assert.throws(()=>f.source.core.select(null),busy);await f.finish();
 }));
 test(family.name+': unselected metadata stays absent and preparation invents no bindings or records',{timeout:120000},async()=>heldMetadataSession({family,retained:'none'},async f=>{
  f.arm();const parts=await f.prepare();assert.deepEqual(parts,{versions:null,suggestions:null,revisions:null});assert.deepEqual(f.recovery(),f.before);assert.equal(f.writes,0);assert.equal(f.network,0);
 }));
}
