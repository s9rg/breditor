import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
/** Inspect exact complete destination state before reopening anything that might autosave. */
import {RichAssetStore} from "@breditor/experimental-rich-content";
import {SharedSegmentedPersistentSession} from "../persistence/segmented_session.js";
import {SharedSegmentedRelaySession} from "../segmented_relay/session.js";
import {readContinuedHead,readSegmentedHead} from "../persistence/segmented_head.js";
import {readGenerationCut,readSegmentedCut} from "../persistence/segmented_database.js";
import {existingDatabase} from "../participant_recovery/journal.js";
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
export async function inspectGenerationDestination<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>):Promise<"empty"|"exact">{
 const db=await existingDatabase(p.options.destinations.source);p.guard();if(!db)return"empty";let changed=false;db.onversionchange=()=>{changed=true;db.close();};try{
  if(db.version!==1||[...db.objectStoreNames].sort().join(",")!=="generation_files,generation_heads")throw fail("generation_participant_diverged");
  const counts=await new Promise<number[]>((resolve,reject)=>{const tx=db.transaction(["generation_files","generation_heads"],"readonly"),result:number[]=[];let reason:unknown;for(const[i,name]of ["generation_files","generation_heads"].entries()){const s=tx.objectStore(name);if(s.keyPath!==null||s.autoIncrement||s.indexNames.length){reason=fail("generation_participant_diverged");tx.abort();break;}s.count().onsuccess=e=>{result[i]=(e.target as IDBRequest<number>).result;};}tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(reason??fail());});p.guard();if(changed)throw fail("generation_participant_diverged");if(counts[0]===0&&counts[1]===0)return"empty";if(counts[1]!==(p.predecessor?2:1)||counts[0]!==p.cut.files.length)throw fail("generation_participant_diverged");
  const id=p.options.expected.identity.source.native,key=[id.room,id.writer] as const;
  if(p.predecessor){
   const prior=await readGenerationCut(db,key,readSegmentedHead,true);
   p.guard();
   if(changed||prior?.head!==p.predecessor.head)throw fail("generation_participant_diverged");
  }
  const actual=p.predecessor?await readGenerationCut(db,key,readContinuedHead):await readSegmentedCut(db,key,p.companion?.readHead);p.guard();if(changed||!actual||actual.head!==p.cut.head||actual.files.length!==p.cut.files.length)throw fail("generation_participant_diverged");const map=new Map(actual.files.map(f=>[f.generation,f]));for(const f of p.cut.files)if(JSON.stringify(map.get(f.generation))!==JSON.stringify(f))throw fail("generation_participant_diverged");return"exact";
 }finally{db.close();}
}
export function generationOwnerSource<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,owners:GenerationRecoveryOwners<P>):SharedGenerationSourceSelection<P>{if(!owners.session)throw fail("generation_participant_missing");return {kind:p.session.kind,session:owners.session} as SharedGenerationSourceSelection<P>;}
export function checkGenerationOwner<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,owners:GenerationRecoveryOwners<P>):void{
 p.guard();const source=generationOwnerSource(p,owners);generationSource(source.session).checkManaged();const capture=captureSharedGenerationSource(source);try{if(!sameGenerationRecords(capture.records(),SharedGenerationParticipantBackup.prototype.records.call(p.backup)))throw fail("generation_participant_diverged");SharedGenerationParticipantBackup.prototype.verifySource.call(p.backup,capture);}finally{capture.dispose();}p.guard();generationSource(source.session).checkManaged();
}
export async function restoreGenerationSource<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,owners:GenerationRecoveryOwners<P>,complete:boolean):Promise<void>{
 p.guard();const status=await inspectGenerationDestination(p);p.guard();if(complete&&status!=="exact")throw fail("generation_participant_missing");const data=SharedGenerationParticipantBackup.prototype.sourceRecovery.call(p.backup),database=p.options.destinations.source,authority={writerRecovery:"host-reacquired" as const};
 switch(p.session.kind){
  case"continued-local":{
   const options={...p.session.options,database};
   owners.session=status==="exact"?await SharedSegmentedPersistentSession.openContinued(guardContinuedRecovery(options,p.guard)):
    await SharedSegmentedPersistentSession.restoreContinuedRecovery(guardContinuedRecovery({...options,...authority,backup:data as SharedContinuedHistoryBackup},p.guard));
   break;
  }
  case"local":owners.session=status==="exact"?await SharedSegmentedPersistentSession.open(inheritActorLeaseInput(p.session.options,{...p.session.options,database,initialGenerations:{root:"unused",active:"unused-2"},create:()=>{throw fail("generation_participant_missing");}})):await SharedSegmentedPersistentSession.restoreRecovery(inheritActorLeaseInput(p.session.options,{...p.session.options,database,...authority,recovery:data as SharedSegmentedRecovery}));break;
  case"relay":owners.session=status==="exact"?await SharedSegmentedRelaySession.open(inheritActorLeaseInput(p.session.options,{...p.session.options,database,initialGenerations:{root:"unused",active:"unused-2"},create:()=>{throw fail("generation_participant_missing");}})):await SharedSegmentedRelaySession.restoreRecovery(inheritActorLeaseInput(p.session.options,{...p.session.options,database,...authority,recovery:data as SharedSegmentedRelayRecovery}));break;
  case"retained":owners.session=status==="exact"?await SharedSegmentedRelaySession.openRetained(inheritActorLeaseInput(p.session.options,{...p.session.options,database,initialGenerations:{root:"unused",active:"unused-2"},create:()=>{throw fail("generation_participant_missing");}})):await SharedSegmentedRelaySession.restoreRetainedRecovery(inheritActorLeaseInput(p.session.options,{...p.session.options,database,...authority,recovery:data as SharedSegmentedRetainedRecovery}));break;
 }
 p.guard();checkGenerationOwner(p,owners);if(await inspectGenerationDestination(p)!=="exact")throw fail("generation_participant_diverged");p.guard();
}
export async function restoreGenerationUploads<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,owners:GenerationRecoveryOwners<P>,complete:boolean):Promise<void>{
 p.guard();const name=p.options.destinations.uploads,status=await inspectUploads(name);p.guard();if(complete&&status!=="retained"&&status!=="empty")throw fail("generation_participant_missing");const options={...(p.options.limits?{limits:p.options.limits}:{})},file=SharedGenerationParticipantBackup.prototype.uploadBackup.call(p.backup);
 owners.uploads=status==="retained"||complete?await RichAssetStore.openRetained(name,options):await RichAssetStore.restoreBackup(name,file,{...options,uploadState:"preserve",...(p.options.signal?{signal:p.options.signal}:{})});p.guard();const actual=await owners.uploads.exportBackup(p.options.signal?{signal:p.options.signal}:{});p.guard();if(await generationParticipantDigest(actual,p.options.signal)!==await generationParticipantDigest(file,p.options.signal))throw fail("generation_participant_diverged");p.guard();
}
export async function verifyGenerationOwners<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,owners:GenerationRecoveryOwners<P>):Promise<void>{p.guard();checkGenerationOwner(p,owners);const source=captureSharedGenerationSource(generationOwnerSource(p,owners));try{await SharedGenerationParticipantBackup.prototype.verifyRecovered.call(p.backup,source,owners.uploads!,p.options.signal?{signal:p.options.signal}:{});}finally{source.dispose();}p.guard();RichAssetStore.prototype.checkOpen.call(owners.uploads!);}
export async function discardGenerationOwners<P extends SharedSelectionPolicy>(owners:GenerationRecoveryOwners<P>):Promise<void>{try{await owners.session?.discardAndClose();}finally{owners.uploads?.close();}}
