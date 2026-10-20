/** Independently valid native histories must still refuse a fork or foreign room
 * namespace. Failure must not change the retained native, packet or upload bytes. */
import assert from 'node:assert/strict';
import {generationParticipant} from './generation-participant.mjs';

export async function generationInventoryRefusals({api,rich,profile,fixture,inventory,counts,tag}) {
 const [author,observer]=fixture.clients;
 let serial=0;
 async function run(name,configuration,verify){
  const h=await generationParticipant({api,rich,profile,fixture,client:author,kind:'relay',edit:false,tag:`${tag}-${serial++}`,counts,...configuration});
  try{const source=h.exportRecovery(),records=h.source.records(),uploads=new Uint8Array(await(await h.uploads.exportBackup()).arrayBuffer());h.backup.verifySource(h.source);await verify(h);h.backup.verifySource(h.source);assert.deepEqual(h.exportRecovery(),source);assert.deepEqual(h.source.records(),records);assert.deepEqual(new Uint8Array(await(await h.uploads.exportBackup()).arrayBuffer()),uploads);counts.refusalRetentionComparisons+=3;}
  catch(error){console.error('Generation inventory case',name,tag);throw error;}
  finally{await h.close();}
 }
 const refuse=code=>h=>assert.throws(()=>inventory.checkGenerationSources([h]),error=>error.code===code&&!String(error).includes('PRIVATE'));
 await run('document behind',{kind:'local',paired:false,documentCheckpoint:author.baseCheckpoint},h=>{const result=inventory.checkGenerationSources([h]);assert.equal(result.kind,'pending');assert.ok(result.missing.some(row=>row.kind==='document'&&row.writer===author.writer&&row.reason==='server_ahead'));counts.behindDocumentPending++;});
 await run('document fork',{kind:'local',paired:false,documentCheckpoint:author.forkCheckpoint},h=>{refuse('inventory_fork')(h);counts.documentForkRefusals++;});
 await run('permanent observer authored',{kind:'local',client:observer,paired:false,readOnly:false,edit:true},h=>{refuse('inventory_source')(h);counts.observerAuthorRefusals++;});
 await run('foreign participant principal',{kind:'local',paired:false,principal:observer.principal},h=>{refuse('inventory_source')(h);counts.foreignPrincipalRefusals++;});
 await run('review fork',{reviewCheckpoint:author.forkReviewCheckpoint},h=>{refuse('inventory_fork')(h);counts.reviewForkRefusals++;});
 await run('review behind',{reviewCheckpoint:author.emptyReviewCheckpoint},h=>{const result=inventory.checkGenerationSources([h]);assert.equal(result.kind,'pending');assert.ok(result.missing.some(row=>row.kind==='review'&&row.actor===author.actor&&row.reason==='server_ahead'));counts.behindReviewPending++;});
 await run('review namespace',{changeBinding(binding){binding.review.binding='0'.repeat(64);}},h=>{refuse('inventory_source')(h);counts.reviewBindingRefusals++;});
 await run('document transport',{changeBinding(binding){if(fixture.atomic){delete binding.document.writerTransport;delete binding.review.writerTransport;}else{binding.document.writerTransport='atomic-v2';binding.review.writerTransport='atomic-v2';}}},h=>{refuse('inventory_source')(h);counts.transportBindingRefusals++;});
 await run('permanent review observer kind',{client:observer,changeBinding(binding){delete binding.review.reviewEditing;}},h=>{refuse('inventory_source')(h);counts.reviewObserverRefusals++;});
 await run('version namespace',{kind:'retained',changeRetained(retained){retained.versions.binding='0'.repeat(64);}},h=>{refuse('inventory_source')(h);counts.versionBindingRefusals++;});
 if(fixture.atomic){
  await run('suggestion namespace',{kind:'retained',changeRetained(retained){retained.suggestions.identity.binding='0'.repeat(64);}},h=>{refuse('inventory_source')(h);counts.suggestionBindingRefusals++;});
  await run('revision namespace',{kind:'retained',changeRetained(retained){retained.revisions.binding='0'.repeat(64);}},h=>{refuse('inventory_source')(h);counts.revisionBindingRefusals++;});
  await run('service effect writer',{kind:'retained',changeRetained(retained){retained.suggestions.identity.effectWriter='9909';}},h=>{refuse('inventory_source')(h);counts.effectWriterRefusals++;});
 }
 await run('readable retired native source',{},h=>{const before=inventory.checkGenerationSources([h]);h.session.core.retire();assert.deepEqual(inventory.checkGenerationSources([h]),before);assert.throws(()=>h.session.core.type('Not editable'),error=>error.code==='retired');counts.retiredReadableSources++;});
 await run('disposed inventory during input snapshot',{},async h=>{const second=await api.readSharedRoomParticipantInventory(inventory.file(),inventory.identity());try{const input={get backup(){second.dispose();return h.backup;},source:h.source};assert.throws(()=>second.checkGenerationSources([input]),error=>error.code==='inventory_closed');counts.inventoryDisposalsDuringRead++;}finally{second.dispose();}});
}
