/** The outer retirement reservation holds metadata through the final authority
 * callback. Test the independent complete-cut witness using a real suggestion
 * change after releasing that reservation. */
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
import{LoadedNativeReconstructionCurrent}from'../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import{prepareFinalNativeCut}from'../packages/breditor-collaboration/dist/complete_operation_cohort/final_native_cut.js';
import{originalNativeRetention}from'../packages/breditor-collaboration/dist/operation_read/native_retention.js';
import{withSelectedNativeDeliverySources}from'../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
let fixtures,transport;before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'native-room-final-cut-endpoints-closed.json'),{rows});assert.ok(rows.every(row=>row.closed));}});
test('retirement holds metadata through final authority and the cut witness detects a changed queue',async()=>{
 const opened=new Set(),flush=SharedSuggestionQueue.prototype.flush,stackLimit=Error.stackTraceLimit;let s,f,loaded;const witnesses=[];
 try{
  // Observe real SDK instances even when their opening factory was captured
  // earlier. The original method and returned Promise are unchanged.
  SharedSuggestionQueue.prototype.flush=function(...args){opened.add(this);return flush.apply(this,args);};
  s=await selectedProviderSession(fixtures,'final-retirement-packets',{documentSegmented:false,reviewSegmented:false});SharedSuggestionQueue.prototype.flush=flush;
  const {id,core}=s.owner.clients.find(row=>row.family==='original'),queue=[...opened].find(value=>{try{return managedSourceCore(value)===core;}catch{return false;}});assert.ok(queue,'Use the actual reopened source queue');
  const document=core.documentJson(),proposal=queue.propose('A pending proposal, not accepted content','7',{scope:'commands',edit:{kind:'commands',data:[{kind:'insert_text',data:{block:'p',offset:0,text:'Pending proposal only '}}]}});await queue.flush();assert.equal(core.documentJson(),document);
  const retained=await s.retain();f=await preparedRetirement(fixtures,'final-retirement-packets-prepared',{}, {s,retained});
  const names=await databaseNames(),pairs=f.clients.map(row=>nativePair(row.core));
  let approved=false,attempts=0,refusal;
  Error.stackTraceLimit=100;
  await assert.rejects(retirePreparedRoom(s.owner,{...s.input(),checkAuthority(){
   if(!approved||attempts||/\bauthorize(?:\d+)?\b/.test(new Error().stack??''))return;
   attempts++;
   try{queue.stopRetryingPublication(proposal.id);}catch(error){refusal=error;throw error;}
  }},{retained,expected:f.data.choice,approve(){approved=true;return true;}}),error=>error.code==='participant_authority');
  assert.equal(refusal?.code,'suggestion_recovery_in_use');
  assert.equal(attempts,1,'Exercise the final post-reader callback');
  assert.equal(queue.status(proposal.id).publish,true);
  assert.deepEqual(f.clients.map(row=>nativePair(row.core)),pairs);
  assert.equal(s.owner.clients.length,7);

  loaded=await LoadedNativeReconstructionCurrent.read(retained,f.integrity);
  const state=await loaded.records(id);
  const paired=state.source.native.format==='breditor/persistent-paired-record-read';
  const source=await withSelectedNativeDeliverySources(s.owner,s.input(),async(_scope,sources)=>{
   const {source:actual}=sources.find(row=>row.id===id);
   const parent=actual.parent;
   assert.equal(parent.kind,'original');
   assert.equal(parent.packets.suggestions,queue);
   return originalNativeRetention({core,...(paired?{session:parent.session}:{}),...parent.packets},actual.check,parent.session);
  });
  // Drive the same production capture after the outer reservation ends.
  const records=[{id,family:'original',payload:{family:'original',state,files:[]}}];
  let readerClosed=false;
  for(let index=0;index<2;index++)witnesses.push(prepareFinalNativeCut([{id,family:'original',source}],records,()=>{},()=>readerClosed,()=>{}));
  readerClosed=true;
  witnesses[0].check(); // Admit one witness while the real queue still matches.
  queue.stopRetryingPublication(proposal.id);
  assert.equal(queue.status(proposal.id).publish,false);
  assert.throws(()=>witnesses[0].check(),/source is closed, replaced or no longer current/);
  assert.throws(()=>witnesses[1].check(),error=>error.code==='native_retirement_cut_changed');
  assert.deepEqual(f.clients.map(row=>nativePair(row.core)),pairs);

  await queue.flush();
  for(const row of s.owner.clients)assert.equal(typeof row.core.select(null),'boolean');
  assert.equal(core.documentJson(),document);
  assert.deepEqual(await databaseNames(),names);
  const newer=await s.retain();
  assert.notDeepEqual(newer.selection,retained.selection);
  assert.deepEqual((await readPreparedRoom(f.data.choice,f.integrity)).choice,f.data.choice);
  saveEvidence(join(fixtures.directory,'retire-final-packet-change.json'),{passed:true,actualFinalCallback:true,
   pendingIntentFencedDuringRetirement:true,actualPendingIntentChangedAfterRelease:true,finalWitnessRefusedChangedCut:true,
   allSevenOldWritersStillLive:true,bothNativeLanesUnchanged:true,newIntentRetained:true,oldPreparationReadable:true,
   acceptedContentUnchanged:true,roomActivated:false});
 }finally{
  for(const witness of witnesses.reverse())witness.dispose();
  loaded?.dispose();
  SharedSuggestionQueue.prototype.flush=flush;
  Error.stackTraceLimit=stackLimit;
  try{await f?.close();}finally{await s?.close();}
 }
});
