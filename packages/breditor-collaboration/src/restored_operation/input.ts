import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
/** Detached input admission. This owns an independent genuine archive, not the caller's
 * facade, grant or completed legacy recovery. No destination is opened here. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryOptions} from '../independent_delivery/contract.js';
import {IndependentDeliveryCompanion} from '../independent_delivery/companion.js';
import {makeIndependentHistoryCut} from '../independent_history/cut.js';
import {readRestoredInputArchive,type RestoredOperationInputKind} from './input_archive.js';
import {portableCutRecovery} from '../independent_operation/portable_cut.js';
import type {IndependentOperationReadOptions} from '../independent_operation/portable_policy.js';
import type {IndependentOperationBackupSelection} from '../independent_operation/portable_contract.js';
import {independentDeliveryParticipantDigest as digest} from '../independent_delivery_participant/codec.js';
import {restoredOperationPolicy} from './policy.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {wrapOperationHead} from '../independent_operation/operation_head.js';
import {sameOperationCut} from '../independent_operation/cut_codec.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
export interface RestoredOperationInputOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends IndependentOperationReadOptions<P>{
 readonly kind:RestoredOperationInputKind;readonly expected:IndependentOperationBackupSelection;
 readonly database:string;readonly sourceDatabase:string;readonly writerRecovery:'host-reacquired';
 /** Immutable data binding only, not a saved grant or source-owner capability. */
 readonly cohort?:Readonly<{coordinatorDatabase:string;uploadsDatabase:string}>;
}
const missing=()=>{throw fail('restored_operation_create');};
export async function readRestoredOperationInput<P extends SharedSelectionPolicy>(file:Blob,input:RestoredOperationInputOptions<P>){
 const policy=restoredOperationPolicy(input),guard=policy.guard,{database,sourceDatabase,kind}=policy.options;guard();
 const owner=await readRestoredInputArchive(kind,file,policy.options.expected,policy.read);
 let complete=false;
 try{
  guard();const{selection,file:bytes,original,metadata,originalData,live,current,pending}=owner;
  const fileSha256=await digest(bytes,policy.options.signal);guard();
  const cohort=policy.options.cohort,formatVersion=kind==='lineage-v2'?2:1,plan=JSON.stringify({format:cohort?'breditor/shared-coordinated-restored-operation-plan':'breditor/shared-restored-operation-plan',formatVersion,input:{kind,selection,fileSha256},journal:database,source:sourceDatabase,...(cohort?{cohort}:{})});
  const operation=await segmentedDigest((cohort?'breditor/coordinated-restored-operation/':'breditor/restored-operation/')+formatVersion+'\0'+plan);guard();
  const identity=Object.freeze({plan,operation,origin:selection.original.sha256,sourceDatabase}),factory=inheritActorLeaseInput(policy.options.session,{...policy.options.session,database:sourceDatabase,create:missing}) as SharedIndependentDeliveryOptions<P>;
  const recoveries=[originalData];for(const cut of[current,pending])if(cut)recoveries.push(await portableCutRecovery(factory,metadata.operation,cut));recoveries.push(live);guard();
  const targets=[];for(const recovery of recoveries){const decoder=new IndependentDeliveryCompanion(factory,recovery),native=await makeIndependentHistoryCut(recovery.source.documentCheckpoint,recovery.source.reviewCheckpoint,recovery.source.identity,recovery.source.versions);guard();const target={head:wrapOperationHead(decoder.wrap(JSON.parse(native.head),decoder.capture()),identity),files:native.files};if(!targets.length||!sameOperationCut(target,targets[targets.length-1]!))targets.push(target);}
  const{dispose,uploads,uploadEntries,blob,flatten}=owner;
  complete=true;return Object.freeze({kind,selection,file:bytes,original,fileSha256,identity,database,sourceDatabase,factory,guard,options:policy.options,originalData,live,targets:Object.freeze(targets),uploads,uploadEntries,blob,flatten,dispose});
 }finally{if(!complete)owner.dispose();}
}
export type RestoredOperationInput=Awaited<ReturnType<typeof readRestoredOperationInput>>;
