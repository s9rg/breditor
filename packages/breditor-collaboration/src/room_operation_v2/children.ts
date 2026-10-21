/** Actual closed-family native custody. Durable completion never manufactures an owner. */
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedAssetReferenceCapture} from "../asset_references_capture.js";
import type {SharedGenerationSourceCapture} from "../generation_source/capture.js";
import {SharedParticipantRecovery,type RecoveredSharedParticipant} from "../participant_recovery/recovery.js";
import {SharedGenerationParticipantRecovery,type RecoveredSharedGenerationParticipant} from "../generation_participant/recovery.js";
import {OperationalSharedParticipant,resumeOperationalFromRecovered,verifyOperationalParticipantAtOrigin} from "../participant_operation/operation.js";
import {OperationalSharedGenerationParticipant,verifyOperationalGenerationAtOrigin} from "../generation_operation/operation.js";
import type {SharedParticipantOperationCurrentPolicy} from "../participant_operation/types.js";
import type {V2StagedPolicy} from "../room_recovery_catalog_v2/prepare_stage.js";
import type {V2StagedParticipant} from "../room_recovery_catalog_v2/staged_participant.js";
import type {SharedRoomOperationV2Participant} from "./contract.js";
import type {MixedRoomParticipant} from "../mixed_room_operation/custody.js";
import type {RecoveryCleanupScope} from "../participant_recovery/cleanup_scope.js";
import {drainFailedRecoveryOpenings,recoveryOpeningContext} from "../participant_recovery/opening_custody.js";
import {v2PolicyOptions} from "./prepare.js";
import {v2Failure} from "./errors.js";
type OriginalPolicy=Extract<V2StagedPolicy,{family:"original"}>;
type GenerationPolicy=Extract<V2StagedPolicy,{family:"generation"}>;
export type V2OperationChild=
 |{family:"original";id:string;policy:OriginalPolicy;currentPolicy:SharedParticipantOperationCurrentPolicy;currentPolicyPending:boolean;ready:RecoveredSharedParticipant<SharedSelectionPolicy>|undefined;source:SharedAssetReferenceCapture|undefined;operation:OperationalSharedParticipant<SharedSelectionPolicy>|undefined}
 |{family:"generation";id:string;policy:GenerationPolicy;currentPolicy:SharedParticipantOperationCurrentPolicy;currentPolicyPending:boolean;ready:RecoveredSharedGenerationParticipant<SharedSelectionPolicy>|undefined;source:SharedGenerationSourceCapture|undefined;operation:OperationalSharedGenerationParticipant<SharedSelectionPolicy>|undefined};
export function transferredV2Children(policies:readonly V2StagedPolicy[],owners:readonly V2StagedParticipant[]):V2OperationChild[]{return policies.map((policy,index)=>{
 const old=owners[index];if(!old||old.id!==policy.id||old.family!==policy.family)throw v2Failure("room_v2_diverged");
 if(policy.family==="original"&&old.family==="original")return{family:"original",id:policy.id,policy,currentPolicy:{documentReadOnly:true,reviewAccess:policy.value.options.session.kind.includes("paired")?"read_only":null},currentPolicyPending:false,ready:old.value.recovered,source:old.value.source,operation:undefined};
 if(policy.family==="generation"&&old.family==="generation")return{family:"generation",id:policy.id,policy,currentPolicy:{documentReadOnly:true,reviewAccess:policy.options.expected.identity.source.review?"read_only":null},currentPolicyPending:false,ready:old.recovered,source:old.source,operation:undefined};throw v2Failure("room_v2_diverged");
});}
export function resumedV2Children(policies:readonly V2StagedPolicy[],inputs:readonly SharedRoomOperationV2Participant[]):V2OperationChild[]{return policies.map((policy,index)=>{
 const input=inputs[index];if(!input||input.id!==policy.id||input.family!==policy.family)throw v2Failure("room_v2_diverged");const common={id:policy.id,currentPolicy:input.currentPolicy,currentPolicyPending:true,ready:undefined,source:undefined,operation:undefined};return policy.family==="original"?{...common,family:"original",policy}:{...common,family:"generation",policy};
});}
/** Keep the actual failed opening cleanup reachable without discarding completed
 * earlier children. A parent retry/close drains this scope before another open. */
async function reopenReady(child:V2OperationChild,guard:()=>void,scope:RecoveryCleanupScope):Promise<void>{
 const options=v2PolicyOptions(child.policy),context=recoveryOpeningContext(),names=[options.database,...Object.values(options.destinations)];let attempt:SharedParticipantRecovery|SharedGenerationParticipantRecovery|undefined;
 const cleanup=scope.retain(async()=>{try{await attempt?.close();}finally{await drainFailedRecoveryOpenings(context,names);}});
 try{
  if(child.family==="original"){const opened=await SharedParticipantRecovery.resume(child.policy.value.options);attempt=opened;guard();child.ready=await opened.finish();}
  else{const{backup:_backup,...resume}=child.policy.options,opened=await SharedGenerationParticipantRecovery.resume(resume);attempt=opened;guard();child.ready=await opened.finish();}
  guard();await attempt.close();cleanup.complete();
 }catch(error){await cleanup.rollback();throw error;}
}
export async function openV2ChildOperation(child:V2OperationChild,database:string,present:boolean,guard:()=>void,scope:RecoveryCleanupScope,signal?:AbortSignal):Promise<void>{
 const options=v2PolicyOptions(child.policy),context=recoveryOpeningContext(),names=[database,options.database,...Object.values(options.destinations)],cleanup=scope.retain(()=>drainFailedRecoveryOpenings(context,names));
 try{await openHeldV2ChildOperation(child,database,present,guard,scope,signal);cleanup.complete();}catch(error){await cleanup.rollback();throw error;}
}
/** Parent cleanup can drain both component recovery and operational factory
 * failures without revoking or closing an owner that was actually returned. */
async function openHeldV2ChildOperation(child:V2OperationChild,database:string,present:boolean,guard:()=>void,scope:RecoveryCleanupScope,signal?:AbortSignal):Promise<void>{
 if(child.operation&&!child.currentPolicyPending)return;
 // A prior close may have failed after publishing a child under staged policy.
 // Retain that actual owner for retry, never mistake it for current admission.
 if(child.operation){await child.operation.close();child.operation=undefined;present=true;guard();}
 if(!child.ready&&!present)await reopenReady(child,guard,scope);guard();
 if(child.family==="original"){
  const p=child.policy.value.options;
  if(child.ready){const input={database,recovered:child.ready,expected:p.expected,checkAuthority:guard,...(signal?{signal}:{})};child.operation=await(present?resumeOperationalFromRecovered(input):OperationalSharedParticipant.begin(input));child.ready=undefined;}
  if(child.currentPolicyPending){if(child.operation){await child.operation.close();child.operation=undefined;guard();}const{backup:_backup,database:recoveryDatabase,...rest}=p;child.operation=await OperationalSharedParticipant.resume({...rest,database,recoveryDatabase,currentPolicy:child.currentPolicy});child.currentPolicyPending=false;}
 }else{
  const p=child.policy.options;
  if(child.ready){const input={database,recovered:child.ready,expected:p.expected,checkAuthority:guard,...(signal?{signal}:{})};child.operation=await(present?OperationalSharedGenerationParticipant.resumeRecovered(input):OperationalSharedGenerationParticipant.begin(input));child.ready=undefined;}
  if(child.currentPolicyPending){if(child.operation){await child.operation.close();child.operation=undefined;guard();}
   const{backup:_backup,database:recoveryDatabase,...rest}=p,o=p.session.options,review=o.review,session={kind:p.session.kind,options:{...o,readOnly:child.currentPolicy.documentReadOnly,...(review?{review:{...review,access:child.currentPolicy.reviewAccess!}}:{})}} as typeof p.session;
   child.operation=await OperationalSharedGenerationParticipant.resume({...rest,session,database,recoveryDatabase});child.currentPolicyPending=false;
  }
 }
 child.source?.dispose();child.source=undefined;guard();
}
export async function exactV2Child(child:V2OperationChild):Promise<void>{if(!child.operation)throw v2Failure("room_v2_diverged");if(child.family==="original")await verifyOperationalParticipantAtOrigin(child.operation);else await verifyOperationalGenerationAtOrigin(child.operation);}
export function mixedV2Children(children:readonly V2OperationChild[]):MixedRoomParticipant[]{return children.map(child=>{if(!child.operation)throw v2Failure("room_v2_diverged");return child.family==="original"?{family:child.family,id:child.id,operation:child.operation}:{family:child.family,id:child.id,operation:child.operation};});}
export async function closeV2Child(child:V2OperationChild,discard:boolean):Promise<void>{if(child.operation){await(discard?child.operation.discardAndClose():child.operation.close());child.operation=undefined;}if(child.ready){await(discard?child.ready.discardAndClose():child.ready.close());child.ready=undefined;}child.source?.dispose();child.source=undefined;}
