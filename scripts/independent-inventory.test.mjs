/** Actual independent native pairs, local unbound reviews and selected physical cuts. */
import test,{before}from'node:test';import assert from'node:assert/strict';
import*as api from'../packages/breditor-collaboration/dist/index.js';import*as rich from'@breditor/experimental-rich-content';
import{environment}from'./fixtures/room-participant-inventory/environment.mjs';import{independentParticipant}from'./fixtures/independent-inventory/independent-participant.mjs';import{localParticipant}from'./fixtures/independent-inventory/local-participant.mjs';import{nativeInventoryFixtures}from'./fixtures/independent-inventory/native.mjs';
let fixtures,sequence=0;before(async()=>{fixtures=await nativeInventoryFixtures();});
for(const documentSegmented of[false,true])for(const reviewSegmented of[false,true])for(const family of['independent-local','independent-delivery'])test(`genuine native pair, ${family}, document=${documentSegmented}, review=${reviewSegmented}`,async()=>{
 const reset=environment(),item=fixtures.manifest.cases[1],fixture=fixtures.fixture(item),profile=fixtures.profile(fixture),inventory=await api.readSharedServerLogGenerationParticipantInventory(fixtures.inventory(item),fixture.selected),metadata=inventory.metadata().native,held=[];let logical;
 try{
  const create=family==='independent-local'?localParticipant:independentParticipant;
  for(const client of fixture.clients)held.push(await create({api,rich,profile,fixture,metadata,client,documentSegmented,reviewSegmented,tag:'inventory-law-'+sequence++}));
  const rows=held.map(h=>({family,backup:h.backup,source:h.source})),before=held.map(h=>({recovery:h.session.exportRecovery(),records:h.source.records()})),result=inventory.checkIndependentSources(rows);
  assert.deepEqual(result.source,fixture.selected.source);assert.equal(result.coverage.kind,family==='independent-local'?'pending':'covered');assert.equal(result.coverage.registeredStreamsCovered,family!=='independent-local');assert.equal(result.coverage.checkedParticipants.length,2);
  if(family==='independent-local'){assert.equal(result.coverage.missing.filter(r=>r.kind==='unbound_review').length,2);assert.equal(result.coverage.missing.filter(r=>r.kind==='review'&&r.reason==='missing').length,2);for(const h of held)assert.equal(h.session.exportRecovery().versions.length,1);}
  const declaration=fixture.inventoryJson;logical=await api.readSharedRoomParticipantInventory(new Blob([declaration]),{room:metadata.room,sha256:[...Buffer.from(fixtures.sha(declaration),'hex')]});assert.deepEqual(logical.checkIndependentSources(rows),result.coverage);
  assert.throws(()=>inventory.checkMixedSources(rows),e=>e.code==='inventory_source');assert.throws(()=>inventory.checkIndependentSources([rows[0],rows[0]]),e=>e.code==='inventory_duplicate');
  for(const [i,h]of held.entries()){assert.deepEqual(h.session.exportRecovery(),before[i].recovery);assert.deepEqual(h.source.records(),before[i].records);}
  const closed=held[0].source;closed.dispose();assert.throws(()=>inventory.checkIndependentSources(rows),e=>e.code==='inventory_source');
 }finally{logical?.dispose();for(const h of held.reverse())await h.close();inventory.dispose();profile.free();reset();}
});
test('reader lifetime, unknown source kinds and caller iteration cannot manufacture coverage',async()=>{
 const reset=environment(),item=fixtures.manifest.cases[0],fixture=fixtures.fixture(item),inventory=await api.readSharedServerLogGenerationParticipantInventory(fixtures.inventory(item),fixture.selected);
 try{
  assert.throws(()=>inventory.checkIndependentSources([{family:'restored-graph',backup:{},source:{}}]),e=>e.code==='inventory_source');
  assert.throws(()=>inventory.checkSourceCohort([{family:'independent-delivery',backup:{},source:{},ready:true}]),e=>e.code==='inventory_source');
  const input=[];input[Symbol.iterator]=function(){throw Error('Do not call the supplied iterator');};input.map=()=>{throw Error('Do not call a supplied map');};assert.equal(inventory.checkIndependentSources(input).coverage.kind,'pending');assert.equal(inventory.checkSourceCohort(input).coverage.kind,'pending');
  const oversized=new Array(1025);Object.defineProperty(oversized,0,{get(){throw Error('Refuse length before values');}});assert.throws(()=>inventory.checkIndependentSources(oversized),e=>e.code==='inventory_source');assert.throws(()=>inventory.checkSourceCohort(oversized),e=>e.code==='inventory_source');
  const row={family:'independent-delivery',get backup(){inventory.dispose();return{};},source:{}};assert.throws(()=>inventory.checkIndependentSources([row]),e=>e.code==='inventory_closed');
 }finally{inventory.dispose();reset();}
});
