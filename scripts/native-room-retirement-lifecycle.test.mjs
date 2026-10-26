/** Real shutdown notification on an original borrowed outbox, not a fabricated
 * lifecycle flag. The source core must already be irreversibly retired. */
import test,{before,after}from'node:test';
import assert from'node:assert/strict';
import{join}from'node:path';
import{completeControlFixtures}from'./fixtures/physical-recovery-control/complete-fixtures.mjs';
import{acceptedControlTransport}from'./fixtures/physical-recovery-control/accepted-transport.mjs';
import{selectedProviderSession}from'./fixtures/selected-room-provider/session.mjs';
import{preparedRetirement,databaseNames}from'./fixtures/native-room-retirement/session.mjs';
import{SharedSuggestionQueue}from'../packages/breditor-collaboration/dist/suggestions/queue.js';
import{SharedSuggestionRevisions}from'../packages/breditor-collaboration/dist/suggestion_revisions/outbox.js';
import{managedSourceCore,checkManagedCore}from'../packages/breditor-collaboration/dist/managed_custody.js';
import{retirePreparedRoom}from'../packages/breditor-collaboration/dist/native_room_retirement/coordinator.js';
import{sourceSnapshot}from'./fixtures/native-reconstruction/older-disk.mjs';
import{saveEvidence}from'./candidate-release/evidence.mjs';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'native-room-retirement-lifecycle-endpoints-closed.json'),{rows});assert.ok(rows.every(row=>row.closed));}});
test('a genuine revision-closing notification cannot change sibling pending intent after actual native retirement',async()=>{
 const queues=new Set(),revisions=new Set(),qFlush=SharedSuggestionQueue.prototype.flush,rFlush=SharedSuggestionRevisions.prototype.flush,stackLimit=Error.stackTraceLimit;
 let s,f,unsubscribe,armed=false,attempted=false,changed=false,denied,approved=false;
 try{
  SharedSuggestionQueue.prototype.flush=function(...args){queues.add(this);return qFlush.apply(this,args);};
  SharedSuggestionRevisions.prototype.flush=function(...args){revisions.add(this);return rFlush.apply(this,args);};
  s=await selectedProviderSession(fixtures,'retirement-closing-notification',{documentSegmented:false,reviewSegmented:false});
  SharedSuggestionQueue.prototype.flush=qFlush;SharedSuggestionRevisions.prototype.flush=rFlush;
  const core=s.owner.clients.find(row=>row.family==='original').core,find=set=>[...set].find(value=>{try{return managedSourceCore(value)===core;}catch{return false;}}),queue=find(queues),outbox=find(revisions);
  assert.ok(queue,'Observe the actual reopened original queue');assert.ok(outbox,'Observe the actual reopened revision outbox');
  const document=core.documentJson(),proposal=queue.propose('Pending before retirement','9',{scope:'commands',edit:{kind:'commands',data:[{kind:'insert_text',data:{block:'p',offset:0,text:'Pending only '}}]}});
  await queue.flush();assert.equal(core.documentJson(),document);
  const retained=await s.retain();f=await preparedRetirement(fixtures,'retirement-closing-notification-prepared',{}, {s,retained});
  const database=s.f.participants.find(row=>row.family==='original').recovery.destinations.suggestions,before=await sourceSnapshot(database),names=await databaseNames();
  unsubscribe=outbox.subscribe(()=>{if(!armed||attempted)return;let terminal;try{checkManagedCore(core);return;}catch(error){terminal=error?.code;}if(terminal!=='retired')return;attempted=true;try{queue.stopRetryingPublication(proposal.id);changed=queue.status(proposal.id).publish===false;}catch(error){denied=error?.code;}});
  Error.stackTraceLimit=100;
  const result=await retirePreparedRoom(s.owner,{...s.input(),checkAuthority(){if(approved&&!/\bauthorize(?:\d+)?\b/.test(new Error().stack??''))armed=true;}},{retained,expected:f.data.choice,approve(){approved=true;return true;}});
  assert.equal(result.state,'old-writers-closed');assert.equal(attempted,true,'The actual closing observer must run after native retirement');assert.equal(changed,false,'A retired source must not accept new dependent intent from its closing observer');assert.equal(denied,'retired');assert.deepEqual(await sourceSnapshot(database),before);assert.deepEqual(await databaseNames(),names);
  saveEvidence(join(fixtures.directory,'retire-closing-notification.json'),{passed:true,actualClosingObserver:true,actualCoreRetired:true,newIntentRefused:true,refusalCode:denied,sourceRowsUnchanged:true,noNewDatabase:true,oldWritersClosed:true,roomActivated:false});
 }finally{SharedSuggestionQueue.prototype.flush=qFlush;SharedSuggestionRevisions.prototype.flush=rFlush;Error.stackTraceLimit=stackLimit;unsubscribe?.();try{await f?.close();}finally{await s?.close();}}
});
