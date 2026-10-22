/** Actual five-family retention, native graph reborrows and version isolation. */
import test,{before}from'node:test';import assert from'node:assert/strict';
import*as api from'../packages/breditor-collaboration/dist/index.js';import*as rich from'@breditor/experimental-rich-content';
import{PhysicalRoomCatalogV2Archive,physicalCatalogV2ArchiveState as archiveState}from'../packages/breditor-collaboration/dist/physical_room_catalog_v2/archive.js';
import{PhysicalRoomCatalogV2,physicalRoomCatalogV2State as storeState}from'../packages/breditor-collaboration/dist/physical_room_catalog_v2/catalog.js';
import{restoredGraphNativeSource}from'../packages/breditor-collaboration/dist/restored_graph/native_source.js';
import{nativeInventoryFixtures}from'./fixtures/independent-inventory/native.mjs';
import{physicalCatalogV2Fixture}from'./fixtures/physical-catalog-v2/fixture.mjs';
let fixtures,serial=0;before(async()=>{fixtures=await nativeInventoryFixtures();});
const internals={PhysicalRoomCatalogV2Archive,PhysicalRoomCatalogV2,archiveState,storeState,restoredGraphNativeSource},buffer=async file=>Buffer.from(await file.arrayBuffer());
for(const documentSegmented of[false,true])for(const reviewSegmented of[false,true])test(`five-family exact cold catalog, document=${documentSegmented}, review=${reviewSegmented}`,async()=>{
 const h=await physicalCatalogV2Fixture({api,rich,internals,fixtures,documentSegmented,reviewSegmented,tag:'catalog-v2-law-'+serial++});
 try{
  assert.equal(h.archive.metadata().formatVersion,2);assert.equal(h.originalFiles.size,10);assert.deepEqual([...new Set(h.archive.metadata().participants.map(row=>row.family))].sort(),['generation','independent-delivery','independent-local','original','restored-graph']);
  const source=h.sources(),before=h.archive.checkSources(source);assert.equal(before.kind,'pending');assert.equal(before.coverage.kind,'covered');assert.deepEqual(before.source,h.fixture.afterSelected.source);assert.deepEqual(before.unreconciledParticipants,h.historical.map(row=>row.id).sort());h.release();
  await h.begin();await h.store.verify();assert.deepEqual(h.store.checkSources(h.sources()),before);h.release();h.archive.dispose();
  await h.closeStore();await h.resume();assert.deepEqual(h.store.checkSources(h.sources()),before);for(const[key,file]of h.store.files())assert.deepEqual(await buffer(file),await buffer(h.originalFiles.get(key)),key);
  const files=h.store.files();files.clear();assert.equal(h.store.files().size,10);assert.equal(h.counts.networkCalls,0);for(const name of['activate','router','intoParts','stage'])assert.equal(typeof h.store[name],'undefined');
  await assert.rejects(api.SharedPhysicalRoomRecoveryCatalogArchive.read(h.manifest,h.originalFiles,h.expected,h.options));assert.equal('PhysicalRoomCatalogV2'in api,false);assert.equal('PhysicalRoomCatalogV2Archive'in api,false);
 }finally{await h.close();}
});
test('unbound local comments stay pending in an otherwise complete V2 selection',async()=>{const h=await physicalCatalogV2Fixture({api,rich,internals,fixtures,family:'independent-local',historic:false,tag:'catalog-v2-local-'+serial++});try{const result=h.archive.checkSources(h.sources());assert.equal(result.kind,'pending');assert.equal(result.coverage.registeredStreamsCovered,false);assert.deepEqual(result.unreconciledParticipants,[]);assert.equal(result.coverage.missing.filter(row=>row.kind==='unbound_review').length,1);}finally{await h.close();}});
