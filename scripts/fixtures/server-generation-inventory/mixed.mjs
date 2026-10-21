/** Genuine mixed families keep one live owner per writer/actor. Historical copies
 * must be reconciled before opening; this fixture never disables those leases. */
import assert from 'node:assert/strict';
import {recoverParticipant} from '../room-participant-inventory/participant.mjs';
import {generationParticipant} from '../room-participant-inventory/generation-participant.mjs';
export async function probePhysicalMixedSources({api,rich,profile,fixture,inventory,after,counts,tag}) {
 for(const kind of ['local','relay','retained'])for(const [originalIndex,generationIndex]of [[0,1],[1,0]]){
  let original,generation;
  const name=`${tag}-${kind}-${originalIndex}`;
  try{
   const originalClient=fixture.clients[originalIndex];
   original=await recoverParticipant({api,rich,profile,fixture,client:originalClient,counts,tag:name+'-original'});
   await assert.rejects(generationParticipant({api,rich,profile,fixture,client:originalClient,kind,counts,edit:false,tag:name+'-duplicate-writer'}),error=>error.code==='writer_in_use');counts.crossFamilyWriterOwnershipRefusals++;
   if(counts.nativeRooms===0&&kind==='local'&&originalIndex===0){
    // Different document writer, same held review actor. The real review lease
    // must refuse before creating another causal author; no detached metadata proof.
    const [author,observer]=fixture.clients;
    await assert.rejects(generationParticipant({api,rich,profile,fixture,client:{...observer,principal:author.principal,actor:author.actor,observer:false},reviewCheckpoint:author.reviewCheckpoint,kind:'relay',edit:false,readOnly:true,counts,tag:name+'-duplicate-review'}),error=>error.code==='review_writer_in_use');counts.crossFamilyReviewOwnershipRefusals++;
   }
   generation=await generationParticipant({api,rich,profile,fixture,client:fixture.clients[generationIndex],kind,counts,tag:name+'-generation'});
   const rows=[{family:'original',...original},{family:'generation',...generation}],originalRecords=original.source.records(),generationRecords=generation.source.records();
   const result=inventory.checkMixedSources(rows);assert.deepEqual(result.source,fixture.selected.source);assert.deepEqual(result.coverage,after.checkMixedSources(rows).coverage);assert.equal(result.coverage.kind,kind==='local'?'pending':'covered');assert.equal(result.coverage.registeredStreamsCovered,kind!=='local');
   for(const row of rows){assert.throws(()=>inventory.checkMixedSources([row,row]),error=>error.code==='inventory_duplicate');counts.mixedDuplicateRefusals++;}
   assert.deepEqual(original.source.records(),originalRecords);assert.deepEqual(generation.source.records(),generationRecords);counts.mixedRetainedComparisons+=2;counts.mixedCohorts++;
  }finally{await generation?.close();await original?.close();}
 }
}
