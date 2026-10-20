/** Genuine private readonly owners, never editable parts or a reconstructed completion DTO. */
import {SharedGenerationParticipantRecovery,captureReadOnlyRecoveredGenerationSource,type RecoveredSharedGenerationParticipant} from "../generation_participant/recovery.js";
import {stageParticipant,verifyStagedParticipant,type StagedParticipant} from "../room_recovery_catalog/staged_participant.js";
import {SharedGenerationParticipantBackup} from "../generation_participant/backup.js";
import {existingDatabase} from "../participant_recovery/journal.js";
import type {SharedGenerationSourceCapture} from "../generation_source/capture.js";
import type {SharedSelectionPolicy} from "../types.js";
import {checkManagedSource} from "../managed_custody.js";
import {RichAssetStore} from "@breditor/experimental-rich-content";
import {failure} from "../room_recovery_catalog/policy.js";
import type {V2StagedPolicy} from "./prepare_stage.js";
import type {RecoveryCleanupScope} from "../participant_recovery/cleanup_scope.js";
export type V2StagedParticipant=Readonly<{family:"original";id:string;value:StagedParticipant}>|Readonly<{family:"generation";id:string;policy:Extract<V2StagedPolicy,{family:"generation"}>;recovered:RecoveredSharedGenerationParticipant<SharedSelectionPolicy>;source:SharedGenerationSourceCapture}>;
function checkOriginal(value:StagedParticipant):void{const{sources,session,uploads}=value.recovered,core=session.core;for(const owner of [session,sources.suggestions,sources.revisions,sources.versions])if(owner)checkManagedSource(owner,core);RichAssetStore.prototype.checkOpen.call(uploads);}
export async function stageCatalogV2Participant(policy:V2StagedPolicy,complete:boolean,guard:()=>void,scope:RecoveryCleanupScope):Promise<V2StagedParticipant>{
 if(policy.family==="original"){
  let value:StagedParticipant|undefined;const cleanup=scope.retain(async()=>{if(value){await value.recovered.discardAndClose();value.source.dispose();}});
  try{value=await stageParticipant(policy.value,complete,guard,scope);checkOriginal(value);cleanup.complete();return{family:"original",id:policy.id,value};}catch(error){await cleanup.rollback();throw error;}
 }
 let attempt:SharedGenerationParticipantRecovery|undefined,recovered:RecoveredSharedGenerationParticipant|undefined,source:SharedGenerationSourceCapture|undefined;
 const cleanup=scope.retain(async()=>{source?.dispose();try{await recovered?.discardAndClose();}finally{await attempt?.close();}});
 try{
  guard();const prior=await existingDatabase(policy.options.database),exists=!!prior;prior?.close();guard();if(complete&&!exists)throw failure("catalog_missing");const{backup:_backup,...resume}=policy.options;attempt=await(exists?SharedGenerationParticipantRecovery.resume(resume):SharedGenerationParticipantRecovery.begin(policy.options));guard();recovered=await attempt.finish();guard();source=await captureReadOnlyRecoveredGenerationSource(recovered);guard();SharedGenerationParticipantBackup.prototype.verifySource.call(policy.options.backup,source);await attempt.close();cleanup.complete();return{family:"generation",id:policy.id,policy,recovered,source};
 }catch(error){await cleanup.rollback();throw error;}
}
export async function verifyCatalogV2Participant(value:V2StagedParticipant,guard:()=>void):Promise<void>{
 if(value.family==="original"){checkOriginal(value.value);await verifyStagedParticipant(value.value,guard);checkOriginal(value.value);return;}
 guard();const source=await captureReadOnlyRecoveredGenerationSource(value.recovered);try{guard();SharedGenerationParticipantBackup.prototype.verifySource.call(value.policy.options.backup,value.source);SharedGenerationParticipantBackup.prototype.verifySource.call(value.policy.options.backup,source);}finally{source.dispose();}
}
export async function closeCatalogV2Participant(value:V2StagedParticipant,discard:boolean):Promise<void>{
 const source=value.family==="original"?value.value.source:value.source,owner=value.family==="original"?value.value.recovered:value.recovered;await(discard?owner.discardAndClose():owner.close());source.dispose();
}
