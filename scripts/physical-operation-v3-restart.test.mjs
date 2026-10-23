/** Actual interrupted coordinator transactions and cold native continuations.
 * Synthetic local storage only: not physical-browser crash qualification. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalV3Manifest} from './fixtures/physical-operation-v3/manifest.mjs';
import {currentV3Participant,v3CatalogReadOptions,closeV3FixtureWriters,verifyV3RecoveredParticipant} from './fixtures/physical-operation-v3/participants.mjs';
import {PhysicalRoomCatalogV3 as Catalog} from '../packages/breditor-collaboration/dist/physical_room_catalog_v3/catalog.js';
import {PhysicalRoomClientOperationV3 as Operation} from '../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import {PhysicalOperationV3IntentStore as Store} from '../packages/breditor-collaboration/dist/physical_room_operation_v3/storage.js';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
async function retire(parts){for(const row of parts?.participants??[]){if(row.family==='original'){await row.parts.sources.revisions?.close();await row.parts.sources.suggestions?.close();await row.parts.sources.versions?.close();await row.parts.session.discardAndClose();}else await row.parts.source.session.discardAndClose();row.parts.uploads.close();}}
const before=async(fixture,families)=>{await closeV3FixtureWriters(fixture);const participants=[];for(const family of families)participants.push(await currentV3Participant(fixture,family,'restart '+family));const read=v3CatalogReadOptions(fixture),expected=fixture.archive.selection(),catalog=await Catalog.begin({...read,database:'restart retained catalog',archive:fixture.archive,expected}),options={...read,database:'restart whole intent',expected,participants,checkAuthority(){}};return{catalog,options};};
for(const cut of ['started','complete','operational'])test('lost '+cut+' acknowledgement cold-resumes exactly without duplicate child work',async()=>operationalV3Manifest(async fixture=>{
 const h=await before(fixture,['local-operation-flat']),advance=Store.prototype.advance;let owner,parts,injected=false;
 try{
  owner=await Operation.begin({...h.options,catalog:h.catalog});Store.prototype.advance=async function(old,next){await advance.call(this,old,next);if(!injected&&(cut==='operational'?next.phase==='operational':old.phase===next.phase&&next.participants[0].state===cut)){injected=true;throw Error('Real committed write lost its acknowledgement');}};
  await assert.rejects(owner.finish(),e=>e.code==='physical_operation_v3_storage');assert.equal(injected,true);Store.prototype.advance=advance;await owner.close();
  owner=await Operation.resume({...h.options,catalogDatabase:'restart retained catalog'});await owner.finish();parts=await owner.intoParts();await verifyV3RecoveredParticipant(h.options.participants[0],fixture.source,parts.participants[0].parts);assert.equal(fixture.h.counts.networkCalls,0);
 }finally{Store.prototype.advance=advance;await retire(parts);await owner?.discardAndClose();await h.catalog.close();}
}));
test('complete child with a missing source refuses instead of creating an empty replacement',async()=>operationalV3Manifest(async fixture=>{
 const h=await before(fixture,['local-operation-flat']);let owner;
 try{
  owner=await Operation.begin({...h.options,catalog:h.catalog});await owner.finish();await owner.close();const sourceName=h.options.participants[0].options.sourceDatabase,request=indexedDB.deleteDatabase(sourceName);await new Promise((resolve,reject)=>{request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Every real source handle must have closed'));});
  owner=await Operation.resume({...h.options,catalogDatabase:'restart retained catalog'});await assert.rejects(owner.finish(),e=>e.code==='physical_operation_v3_missing');assert.equal((await indexedDB.databases()).some(row=>row.name===sourceName),false);assert.equal((await owner.progress()).participants[0].state,'complete');
 }finally{await owner?.discardAndClose();await h.catalog.close();}
}));
test('occupied child destination refuses before new intent and leaves source catalog usable',async()=>operationalV3Manifest(async fixture=>{
 const h=await before(fixture,['local-operation-flat']),destination=h.options.participants[0].options.database,request=indexedDB.open(destination,1);request.onupgradeneeded=()=>request.result.createObjectStore('foreign').put('keep exact','state');const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});db.close();
 try{await assert.rejects(Operation.begin({...h.options,catalog:h.catalog}),e=>e.code==='physical_operation_v3_exists');assert.equal((await indexedDB.databases()).some(row=>row.name===h.options.database),false);await h.catalog.verify();const read=indexedDB.open(destination);const retained=await new Promise((resolve,reject)=>{read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);});try{const tx=retained.transaction('foreign'),value=tx.objectStore('foreign').get('state');assert.equal(await new Promise((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error);}), 'keep exact');}finally{retained.close();}}
 finally{await h.catalog.close();}
}));
test('two real distinct writers cross local and restored-graph custody together with historical copies still pending',async()=>operationalV3Manifest(async fixture=>{
 const h=await before(fixture,['local-operation-flat','restored-graph']);let owner,parts;
 try{owner=await Operation.begin({...h.options,catalog:h.catalog});const ready=await owner.finish();assert.equal(ready.unreconciledParticipants.length,fixture.source.metadata.participants.length-2);await owner.close();owner=await Operation.resume({...h.options,catalogDatabase:'restart retained catalog'});await owner.finish();parts=await owner.intoParts();assert.equal(parts.participants.length,2);for(const selected of h.options.participants){const row=parts.participants.find(row=>row.id===selected.id);assert.equal(row.family,selected.family);await verifyV3RecoveredParticipant(selected,fixture.source,row.parts);if(!row.parts.source.session.core.view().readOnly){insertCleanupText(row.parts.source.session.core,'Whole-cohort continuation ');await row.parts.source.session.flush();}}assert.equal(fixture.h.counts.networkCalls,0);}
 finally{await retire(parts);await owner?.discardAndClose();await h.catalog.close();}
}));
