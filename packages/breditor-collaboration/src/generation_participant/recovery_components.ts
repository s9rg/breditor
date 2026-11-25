import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
/** Inspect exact complete destination state before reopening anything that might autosave. */
import {RichAssetStore} from "@breditor/experimental-rich-content";
import {SharedSegmentedPersistentSession} from "../persistence/segmented_session.js";
import {SharedSegmentedRelaySession} from "../segmented_relay/session.js";
import {generationStoreNames} from "../persistence/segmented_database.js";
import {withGenerationRecoveryBootstrap} from "../persistence/generation_recovery_bootstrap.js";
import {inspectExactHistoryRows,type ExactHistoryRows} from "../independent_history/exact_destination.js";
import {inspectUploads} from "../participant_recovery/inspect.js";
import {captureSharedGenerationSource} from "../generation_source/capture.js";
import {generationSource} from "../generation_source/admission.js";
import {sameGenerationRecords} from "../generation_source/records.js";
import type {SharedGenerationSourceSelection} from "../generation_source/contract.js";
import type {SharedSelectionPolicy} from "../types.js";
import {guardContinuedRecovery,type SharedContinuedHistoryBackup} from "../persistence/continue_document_history.js";
import type {SharedSegmentedRecovery} from "../persistence/segmented_session.js";
import type {SharedSegmentedRelayRecovery} from "../segmented_relay/contract.js";
import type {SharedSegmentedRetainedRecovery} from "../segmented_relay/retained_contract.js";
import {generationParticipantFailure as fail} from "./policy.js";
import {generationParticipantDigest} from "./codec.js";
import {SharedGenerationParticipantBackup} from "./backup.js";
import type {PreparedGenerationRecovery} from "./prepare_recovery.js";
import type {SharedGenerationRecoverySession} from "./recovery_contract.js";
export interface GenerationRecoveryOwners<P extends SharedSelectionPolicy>{session?:SharedGenerationRecoverySession<P>;uploads?:RichAssetStore}
function selectedRows<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>):ExactHistoryRows{
 const {room,writer}=p.options.expected.identity.source.native,key=[room,writer];
 return {
  files:p.cut.files.map(file=>({key:[...key,file.generation],value:JSON.stringify(file)})),
  heads:[{key,value:p.cut.head},...(p.predecessor?[{key:[...key,"continued-from"],value:p.predecessor.head}]:[])],
  fail:()=>fail("generation_participant_diverged"),
 };
}
export function generationOwnerSource<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,owners:GenerationRecoveryOwners<P>):SharedGenerationSourceSelection<P>{if(!owners.session)throw fail("generation_participant_missing");return {kind:p.session.kind,session:owners.session} as SharedGenerationSourceSelection<P>;}
export function checkGenerationOwner<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,owners:GenerationRecoveryOwners<P>):void{
 p.guard();const source=generationOwnerSource(p,owners);generationSource(source.session).checkManaged();const capture=captureSharedGenerationSource(source);try{if(!sameGenerationRecords(capture.records(),SharedGenerationParticipantBackup.prototype.records.call(p.backup)))throw fail("generation_participant_diverged");SharedGenerationParticipantBackup.prototype.verifySource.call(p.backup,capture);}finally{capture.dispose();}p.guard();generationSource(source.session).checkManaged();
}
export async function restoreGenerationSource<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,owners:GenerationRecoveryOwners<P>,complete:boolean):Promise<void>{
 const database=p.options.destinations.source,rows=selectedRows(p),signal=p.options.signal;
 const inspect=()=>inspectExactHistoryRows(database,generationStoreNames,rows,p.guard);
 const status=await inspect();
 p.guard();
 if(complete&&status!=="exact")throw fail("generation_participant_missing");
 const data=SharedGenerationParticipantBackup.prototype.sourceRecovery.call(p.backup),authority={writerRecovery:"host-reacquired" as const};
 const wrap=<T extends object>(options:T)=>withGenerationRecoveryBootstrap(inheritActorLeaseInput(p.session.options,options),{rows,check:p.guard,...(signal?{signal}:{})});
 const create=()=>{throw fail("generation_participant_missing");},initialGenerations={root:"unused",active:"unused-2"};
 switch(p.session.kind){
  case"continued-local":{
   const options={...p.session.options,database};
   owners.session=status==="exact"?await SharedSegmentedPersistentSession.openContinued(guardContinuedRecovery(wrap(options),p.guard)):
    await SharedSegmentedPersistentSession.restoreContinuedRecovery(guardContinuedRecovery(wrap({...options,...authority,backup:data as SharedContinuedHistoryBackup}),p.guard));
   break;
  }
  case"local":owners.session=status==="exact"?await SharedSegmentedPersistentSession.open(wrap({...p.session.options,database,initialGenerations,create})):await SharedSegmentedPersistentSession.restoreRecovery(wrap({...p.session.options,database,...authority,recovery:data as SharedSegmentedRecovery}));break;
  case"relay":owners.session=status==="exact"?await SharedSegmentedRelaySession.open(wrap({...p.session.options,database,initialGenerations,create})):await SharedSegmentedRelaySession.restoreRecovery(wrap({...p.session.options,database,...authority,recovery:data as SharedSegmentedRelayRecovery}));break;
  case"retained":owners.session=status==="exact"?await SharedSegmentedRelaySession.openRetained(wrap({...p.session.options,database,initialGenerations,create})):await SharedSegmentedRelaySession.restoreRetainedRecovery(wrap({...p.session.options,database,...authority,recovery:data as SharedSegmentedRetainedRecovery}));break;
 }
 p.guard();checkGenerationOwner(p,owners);if(await inspect()!=="exact")throw rows.fail();p.guard();
}
export async function restoreGenerationUploads<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,owners:GenerationRecoveryOwners<P>,complete:boolean):Promise<void>{
 p.guard();const name=p.options.destinations.uploads,status=await inspectUploads(name);p.guard();if(complete&&status!=="retained"&&status!=="empty")throw fail("generation_participant_missing");const options={...(p.options.limits?{limits:p.options.limits}:{})},file=SharedGenerationParticipantBackup.prototype.uploadBackup.call(p.backup);
 owners.uploads=status==="retained"||complete?await RichAssetStore.openRetained(name,options):await RichAssetStore.restoreBackup(name,file,{...options,uploadState:"preserve",...(p.options.signal?{signal:p.options.signal}:{})});p.guard();const actual=await owners.uploads.exportBackup(p.options.signal?{signal:p.options.signal}:{});p.guard();if(await generationParticipantDigest(actual,p.options.signal)!==await generationParticipantDigest(file,p.options.signal))throw fail("generation_participant_diverged");p.guard();
}
export async function verifyGenerationOwners<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,owners:GenerationRecoveryOwners<P>):Promise<void>{p.guard();checkGenerationOwner(p,owners);const source=captureSharedGenerationSource(generationOwnerSource(p,owners));try{await SharedGenerationParticipantBackup.prototype.verifyRecovered.call(p.backup,source,owners.uploads!,p.options.signal?{signal:p.options.signal}:{});}finally{source.dispose();}p.guard();RichAssetStore.prototype.checkOpen.call(owners.uploads!);}
export async function discardGenerationOwners<P extends SharedSelectionPolicy>(owners:GenerationRecoveryOwners<P>):Promise<void>{try{await owners.session?.discardAndClose();}finally{owners.uploads?.close();}}
