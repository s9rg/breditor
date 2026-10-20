import {SharedParticipantRecovery,type RecoveredSharedParticipant} from "../participant_recovery/recovery.js";
import {existingDatabase,readRecoveryJournal} from "../participant_recovery/journal.js";
import {captureSharedAssetReferences,type SharedAssetReferenceCapture} from "../asset_references_capture.js";
import type {SharedSelectionPolicy} from "../types.js";
import {failure,known} from "./policy.js";
import type {StagedPolicy} from "./prepare_stage.js";
import type {RecoveryCleanupScope} from "../participant_recovery/cleanup_scope.js";
import {drainFailedRecoveryOpenings,recoveryOpeningContext} from "../participant_recovery/opening_custody.js";
export interface StagedParticipant {readonly policy:StagedPolicy;readonly recovered:RecoveredSharedParticipant<SharedSelectionPolicy>;readonly source:SharedAssetReferenceCapture}
export async function requireMissing(name:string):Promise<void>{const db=await existingDatabase(name);if(db){db.close();throw failure("catalog_exists");}}
/** Resolve started-before-create and committed-before-ACK without overwriting any existing work. */
export async function stageParticipant(policy:StagedPolicy,complete:boolean,guard:()=>void,scope:RecoveryCleanupScope):Promise<StagedParticipant>{
 let attempt:SharedParticipantRecovery<SharedSelectionPolicy>|undefined,recovered:RecoveredSharedParticipant<SharedSelectionPolicy>|undefined,source:SharedAssetReferenceCapture|undefined;
 const context=recoveryOpeningContext(),names=[policy.options.database,...Object.values(policy.options.destinations)];
 const cleanup=scope.retain(async()=>{source?.dispose();try{await recovered?.discardAndClose();}finally{try{await attempt?.close();}finally{await drainFailedRecoveryOpenings(context,names);}}});
 try{
  guard();const prior=await existingDatabase(policy.options.database),exists=!!prior;prior?.close();guard();if(complete&&!exists)throw failure("catalog_missing");
  attempt=await(exists?SharedParticipantRecovery.resume(policy.options):SharedParticipantRecovery.begin(policy.options));guard();recovered=await attempt.finish();attempt=undefined;guard();
  if(recovered.session.core.view().readOnly!==true)throw failure("catalog_restore");source=captureSharedAssetReferences(recovered.sources);
  const result={policy,recovered,source};await verifyStagedParticipant(result,guard);cleanup.complete();return result;
 }catch(error){await cleanup.rollback();throw known(error,"catalog_restore");}
}
/** A completion flag cannot substitute for actual sources, whole uploads and the original native marker. */
export async function verifyStagedParticipant(value:StagedParticipant,guard:()=>void):Promise<void>{
 guard();if(value.recovered.session.core.view().readOnly!==true)throw failure("catalog_restore");await value.policy.options.backup.verifyRecovered(value.source,value.recovered.uploads,value.policy.options.signal?{signal:value.policy.options.signal}:{});guard();
 const db=await existingDatabase(value.policy.options.database);try{guard();if(!db)throw failure("catalog_missing");const record=await readRecoveryJournal(db,value.policy.prepared.record);guard();if(record.phase!=="ready")throw failure("catalog_diverged");}finally{db?.close();}
}
export async function discardStagedParticipants(values:readonly StagedParticipant[]):Promise<void>{const results=await Promise.allSettled([...values].reverse().map(async value=>{value.source.dispose();await value.recovered.discardAndClose();}));if(results.some(r=>r.status==="rejected"))throw failure();}
