/** A genuine dependent intent may change without a native edit. The actual
 * complete LIVE/packet witness must outlive read cleanup and final permission.
 * Test-only stack observation distinguishes the final callback from the scoped
 * authorize path; no file names, offsets or protocol data choose that boundary. */
import test,{before,after}from'node:test';import assert from'node:assert/strict';import{join}from'node:path';
import{completeControlFixtures}from'./fixtures/physical-recovery-control/complete-fixtures.mjs';
import{acceptedControlTransport}from'./fixtures/physical-recovery-control/accepted-transport.mjs';
import{selectedProviderSession}from'./fixtures/selected-room-provider/session.mjs';
import{preparedRetirement,nativePair,databaseNames}from'./fixtures/native-room-retirement/session.mjs';
import{SharedSuggestionQueue}from'../packages/breditor-collaboration/dist/suggestions/queue.js';
import{managedSourceCore}from'../packages/breditor-collaboration/dist/managed_custody.js';
import{retirePreparedRoom}from'../packages/breditor-collaboration/dist/native_room_retirement/coordinator.js';
import{readPreparedRoom}from'../packages/breditor-collaboration/dist/native_room_preparation/coordinator.js';
import{saveEvidence}from'./candidate-release/evidence.mjs';
let fixtures,transport;before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'native-room-final-cut-endpoints-closed.json'),{rows});assert.ok(rows.every(row=>row.closed));}});
test('final retirement refuses a real pending suggestion change after the complete comparison and keeps all seven writers live',async()=>{
 const opened=new Set(),flush=SharedSuggestionQueue.prototype.flush,stackLimit=Error.stackTraceLimit;let s,f;
 try{
  // Observe real SDK instances even when their opening factory was captured
  // earlier. The original method and returned Promise are unchanged.
  SharedSuggestionQueue.prototype.flush=function(...args){opened.add(this);return flush.apply(this,args);};
  s=await selectedProviderSession(fixtures,'final-retirement-packets',{documentSegmented:false,reviewSegmented:false});SharedSuggestionQueue.prototype.flush=flush;
  const core=s.owner.clients.find(row=>row.family==='original').core,queue=[...opened].find(value=>{try{return managedSourceCore(value)===core;}catch{return false;}});assert.ok(queue,'Use the actual reopened source queue');
  const document=core.documentJson(),proposal=queue.propose('A pending proposal, not accepted content','7',{scope:'commands',edit:{kind:'commands',data:[{kind:'insert_text',data:{block:'p',offset:0,text:'Pending proposal only '}}]}});await queue.flush();assert.equal(core.documentJson(),document);
  const retained=await s.retain();f=await preparedRetirement(fixtures,'final-retirement-packets-prepared',{}, {s,retained});const names=await databaseNames(),pairs=f.clients.map(row=>nativePair(row.core));let approved=false,attempts=0,changed=false;
  Error.stackTraceLimit=100;
  await assert.rejects(retirePreparedRoom(s.owner,{...s.input(),checkAuthority(){if(!approved||attempts||/\bauthorize(?:\d+)?\b/.test(new Error().stack??''))return;attempts++;queue.stopRetryingPublication(proposal.id);changed=queue.status(proposal.id).publish===false;}},{retained,expected:f.data.choice,approve(){approved=true;return true;}}));
  assert.equal(attempts,1,'The final post-reader callback must actually run');assert.equal(changed,true,'Exercise a real changed queue row, not a denied edit or unrelated error');assert.deepEqual(f.clients.map(row=>nativePair(row.core)),pairs);assert.equal(s.owner.clients.length,7);for(const row of s.owner.clients)assert.equal(typeof row.core.select(null),'boolean');
  await queue.flush();assert.equal(queue.status(proposal.id).publish,false);assert.equal(core.documentJson(),document);assert.deepEqual(await databaseNames(),names);const newer=await s.retain();assert.notDeepEqual(newer.selection,retained.selection);assert.deepEqual((await readPreparedRoom(f.data.choice,f.integrity)).choice,f.data.choice);
  saveEvidence(join(fixtures.directory,'retire-final-packet-change.json'),{passed:true,actualFinalCallback:true,actualPendingIntentChanged:true,retirementRefused:true,allSevenOldWritersStillLive:true,bothNativeLanesUnchanged:true,newIntentRetained:true,oldPreparationReadable:true,acceptedContentUnchanged:true,roomActivated:false});
 }finally{SharedSuggestionQueue.prototype.flush=flush;Error.stackTraceLimit=stackLimit;try{await f?.close();}finally{await s?.close();}}
});
