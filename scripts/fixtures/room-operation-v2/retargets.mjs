/** Genuine native two-family guard replacement: a later refusal must leave the
 * surviving earlier family on its original usable guard. No ready DTO adoption. */
import assert from 'node:assert/strict';
import {catalogV2ArchiveState} from '../../../packages/breditor-collaboration/dist/room_recovery_catalog_v2/archive.js';
import {prepareCatalogV2Stage} from '../../../packages/breditor-collaboration/dist/room_recovery_catalog_v2/prepare_stage.js';
import {prepareRecovery} from '../../../packages/breditor-collaboration/dist/participant_recovery/prepare.js';
import {prepareRecoveredPreparationRetargets} from '../../../packages/breditor-collaboration/dist/participant_recovery/recovery.js';
import {prepareRecoveredGenerationRetargets} from '../../../packages/breditor-collaboration/dist/generation_participant/recovery.js';
import {commitReadyPreparationRetargets} from '../../../packages/breditor-collaboration/dist/participant_recovery/ready_retarget.js';
async function closeParts(family,parts){if(family==='original'){await parts.sources.revisions?.close();await parts.sources.suggestions?.close();await parts.sources.versions?.close();await parts.session.close();}else await parts.source.session.close();parts.uploads.close();}
export async function v2AtomicRetargets({api,input,chosen,tag,before}){
 const counts={atomicGuardRefusals:0,survivingOriginalGuards:0,survivingGenerationGuards:0,unchangedDocumentCuts:0,unchangedReviewCuts:0};
 for(const victim of ['original','generation']){
  const prefix=tag+'-retarget-'+victim,archive=await api.SharedRoomRecoveryCatalogArchiveV2.capture({...input,catalog:prefix}),requests=chosen.map((row,index)=>({...row,recovery:{...row.recovery,database:prefix+'-attempt-'+index,destinations:Object.fromEntries(Object.keys(row.recovery.destinations).map(key=>[key,prefix+'-'+index+'-'+key]))}}));
  let attemptOriginal,attemptGeneration,readyOriginal,readyGeneration,parts;const survivor=victim==='original'?'generation':'original';let allowed=true,newCalls=0;
  const newGuard=()=>{newCalls++;if(!allowed)throw Error('PRIVATE REPLACEMENT GUARD');};
  try{
   const{policies}=await prepareCatalogV2Stage(requests,catalogV2ArchiveState(archive),prefix+'-unused-catalog',()=>{}),original=policies.find(row=>row.family==='original'),generation=policies.find(row=>row.family==='generation');
   attemptOriginal=await api.SharedParticipantRecovery.begin(original.value.options);readyOriginal=await attemptOriginal.finish();attemptGeneration=await api.SharedGenerationParticipantRecovery.begin(generation.options);readyGeneration=await attemptGeneration.finish();
   const prepared=await prepareRecovery({...original.value.options,checkAuthority:newGuard}),a=prepareRecoveredPreparationRetargets([{owner:readyOriginal,prepared}]),b=prepareRecoveredGenerationRetargets([{owner:readyGeneration,checkAuthority:newGuard}]);
   if(victim==='generation')await readyGeneration.discardAndClose();else await readyOriginal.discardAndClose();allowed=false;
   assert.throws(()=>commitReadyPreparationRetargets(victim==='generation'?[a,b]:[b,a]),e=>e.code===(victim==='generation'?'generation_participant_diverged':'recovery_diverged'));counts.atomicGuardRefusals++;const called=newCalls;
   parts=await(survivor==='original'?readyOriginal.intoParts():readyGeneration.intoParts());assert.equal(newCalls,called,'A failed mixed replacement must leave the survivor on its original guard');const core=survivor==='original'?parts.session.core:parts.source.session.core,id=survivor==='original'?'a-original':'generation-1';assert.equal(core.checkpointJson(),before.get(id).document);assert.equal(core.reviewCheckpoint(),before.get(id).review);counts.unchangedDocumentCuts++;counts.unchangedReviewCuts++;counts[survivor==='original'?'survivingOriginalGuards':'survivingGenerationGuards']++;
  }finally{if(parts)await closeParts(survivor,parts);await readyGeneration?.discardAndClose();await readyOriginal?.discardAndClose();await attemptGeneration?.close();await attemptOriginal?.close();archive.dispose();}
 }
 assert.equal(counts.atomicGuardRefusals,2);assert.equal(counts.survivingOriginalGuards,1);assert.equal(counts.survivingGenerationGuards,1);return counts;
}
