/** Accepted-history execution from a real migrated legacy room, including a
 * clean cold reopen with a new, still-offline document operation. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {generationCompleteControlFixtures} from './fixtures/generation-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/selected-generation-reconciliation/accepted-transport.mjs';
import {generationNativeExecutionSession} from './fixtures/generation-native-execution/session.mjs';
import {selectedNativePairs} from './fixtures/selected-generation-reconciliation/session.mjs';
import {
 previewGenerationNativeExecution as preview,executeGenerationNativeExecution as execute,
 previewGenerationNativeExecutionResume as previewResume,resumeGenerationNativeExecution as resume,
} from '../packages/breditor-collaboration/dist/selected_generation_execution/coordinator.js';
import {GenerationNativeExecutionJournalStore as Store} from '../packages/breditor-collaboration/dist/selected_generation_execution/journal_store.js';

let fixtures,transport;
before(async()=>{
 fixtures=await generationCompleteControlFixtures(new URL('../',import.meta.url).pathname,{migrated:true});
 transport=acceptedControlTransport(fixtures.manifest);
});
after(async()=>{transport?.restore();await fixtures?.close();});

function localFrontiers(read){
 return read.native.ownStreams.participants.map(({id,document,review})=>[id,document.localThrough,review.localThrough]);
}

test('a migrated legacy room imports accepted history and cold-replays without losing later offline work',async()=>{
 const {s,input,close}=await generationNativeExecutionSession(fixtures,'migrated-execution',{
  documentSegmented:true,reviewSegmented:true,
 });
 const options={wasm:fixtures.native,checkAuthority(){}};
 const offlineText='Offline work after migrated accepted history. ';
 let journal;
 try{
  const before=await s.read();
  assert.equal(new Set(s.owner.clients.map(row=>row.family)).size,7);
  for(const lane of ['document','review'])assert.ok(before.heads.some(row=>row.lane===lane&&row.relation==='server-ahead'));
  const proposed=await preview(s.owner,input,s.host,s.input(),{database:'migrated-execution-journal'});
  const firstRequest=transport.accepted.length;
  let approvals=0;
  const result=await execute(s.owner,input,s.host,s.input(),{expected:proposed.choice,approve(choice){
   assert.deepEqual(choice,proposed.choice);
   approvals++;
   return true;
  }});
  assert.equal(approvals,1);
  assert.ok(transport.accepted.slice(firstRequest).some(row=>row.document==='include'));
  assert.ok(result.read.heads.every(row=>row.relation==='local-ahead'));
  assert.deepEqual(localFrontiers(result.read),localFrontiers(before));
  assert.equal(result.read.kind,'pending');
  assert.equal(result.read.native.participants.filter(row=>row.review.kind==='unbound').length,3);
  assert.deepEqual(result.read.provider.provider.assets,before.provider.provider.assets);
  await input.close();

  const previousCore=s.owner.clients[0].core;
  previousCore.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:offlineText}}]});
  const later=previousCore.documentJson();
  assert.ok(later.includes(offlineText));
  await s.cold(await s.retain());
  assert.notEqual(s.owner.clients[0].core,previousCore);
  assert.equal(s.owner.clients[0].core.documentJson(),later);

  const exact=selectedNativePairs(s.owner,true),retryRequest=transport.accepted.length;
  const next=await previewResume(s.owner,s.host,s.input(),{identity:result.identity});
  assert.deepEqual(next.choice.expectedHead,result.head);
  const replayed=await resume(s.owner,s.host,s.input(),{expected:next.choice,approve(choice){
   assert.deepEqual(choice,next.choice);
   approvals++;
   return true;
  }});
  assert.equal(approvals,2);
  assert.ok(transport.accepted.slice(retryRequest).some(row=>row.document==='include'));
  assert.deepEqual(selectedNativePairs(s.owner,true),exact);
  assert.equal(replayed.read.kind,'pending');
  assert.ok(replayed.read.heads.some(row=>row.lane==='document'&&row.relation==='local-ahead'));
  assert.deepEqual(replayed.read.provider.provider.assets,result.read.provider.provider.assets);

  journal=new Store(indexedDB,result.identity,options);
  const snapshot=await journal.open();
  const clientEvents=snapshot.intent.clients.map(row=>['client',row.id]);
  assert.deepEqual(snapshot.events.map(({event})=>[event.stage,event.participant]),[
   ['prepared',null],...clientEvents,['read',null],['resume',null],...clientEvents,['read',null],
  ]);
  assert.equal(snapshot.cuts.size,18);
  assert.deepEqual(snapshot.head,replayed.head);
  for(const outcome of [result,replayed])assert.deepEqual(
   JSON.parse(await snapshot.evidence.get(outcome.head.sequence).text()),outcome.read,
  );

  for(const [index,{core}] of s.owner.clients.entries()){
   const document=core.documentJson(),review=core.reviewSnapshot().view;
   if(index===0){
    assert.equal(core.undo(),true);
    assert.ok(!core.documentJson().includes(offlineText));
    assert.equal(core.redo(),true);
   }else{
    assert.equal(core.redo(),true);
    assert.equal(core.undo(),true);
   }
   assert.equal(core.documentJson(),document);
   assert.equal(core.redoReview().kind,'committed');
   assert.equal(core.undoReview().kind,'committed');
   assert.deepEqual(core.reviewSnapshot().view,review);
  }
  assert.equal(s.f.f.counts.networkCalls,0);
 }finally{
  try{await journal?.close();}finally{await close();}
 }
});
