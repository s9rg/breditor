/** Detached input admission. This owns an independent genuine archive, not the caller's
 * facade, grant or completed legacy recovery. No destination is opened here. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryOptions} from '../independent_delivery/contract.js';
import {IndependentDeliveryCompanion} from '../independent_delivery/companion.js';
import {makeIndependentHistoryCut} from '../independent_history/cut.js';
import {IndependentOperationBackup,portableOperationArchive as snapshot} from '../independent_operation/portable_backup.js';
import {IndependentOperationLineageBackup,operationLineageArchive as lineage} from '../independent_operation/lineage_archive.js';
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
 readonly kind:'snapshot-v1'|'lineage-v1';readonly expected:IndependentOperationBackupSelection;
 readonly database:string;readonly sourceDatabase:string;readonly writerRecovery:'host-reacquired';
}
const missing=()=>{throw fail('restored_operation_create');};
export async function readRestoredOperationInput<P extends SharedSelectionPolicy>(file:Blob,input:RestoredOperationInputOptions<P>){
 const policy=restoredOperationPolicy(input),guard=policy.guard,{database,sourceDatabase,kind}=policy.options;guard();
 const owner=kind==='snapshot-v1'?await snapshot.read.call(IndependentOperationBackup,file,policy.options.expected,policy.read):await lineage.read.call(IndependentOperationLineageBackup,file,policy.options.expected,policy.read);
 let complete=false;
 try{
  guard();const isSnapshot=snapshot.owns(owner),selection=isSnapshot?snapshot.selection.call(owner):lineage.selection.call(owner),bytes=isSnapshot?snapshot.file.call(owner):lineage.file.call(owner),original=isSnapshot?snapshot.originalFile.call(owner):lineage.original.call(owner),metadata=isSnapshot?snapshot.metadata.call(owner):lineage.latestMetadata(owner),originalData=isSnapshot?snapshot.originalRecovery(owner):lineage.originalRecovery(owner),live=isSnapshot?snapshot.live.call(owner):lineage.live.call(owner),current=isSnapshot?snapshot.current.call(owner):lineage.current.call(owner),pending=isSnapshot?snapshot.pending.call(owner):lineage.pending.call(owner);
  const fileSha256=await digest(bytes,policy.options.signal);guard();
  const plan=JSON.stringify({format:'breditor/shared-restored-operation-plan',formatVersion:1,input:{kind,selection,fileSha256},journal:database,source:sourceDatabase});
  const operation=await segmentedDigest('breditor/restored-operation/1\0'+plan);guard();
  const identity=Object.freeze({plan,operation,origin:selection.original.sha256,sourceDatabase}),factory={...policy.options.session,database:sourceDatabase,create:missing} as SharedIndependentDeliveryOptions<P>;
  const recoveries=[originalData];for(const cut of[current,pending])if(cut)recoveries.push(await portableCutRecovery(factory,metadata.operation,cut));recoveries.push(live);guard();
  const targets=[];for(const recovery of recoveries){const decoder=new IndependentDeliveryCompanion(factory,recovery),native=await makeIndependentHistoryCut(recovery.source.documentCheckpoint,recovery.source.reviewCheckpoint,recovery.source.identity,recovery.source.versions);guard();const target={head:wrapOperationHead(decoder.wrap(JSON.parse(native.head),decoder.capture()),identity),files:native.files};if(!targets.length||!sameOperationCut(target,targets[targets.length-1]!))targets.push(target);}
  const dispose=()=>{if(isSnapshot)snapshot.dispose.call(owner as IndependentOperationBackup);else lineage.dispose.call(owner as IndependentOperationLineageBackup);};
  complete=true;return Object.freeze({kind,selection,file:bytes,original,fileSha256,identity,database,sourceDatabase,factory,guard,options:policy.options,originalData,live,targets:Object.freeze(targets),dispose});
 }finally{if(!complete){if(snapshot.owns(owner))snapshot.dispose.call(owner);else lineage.dispose.call(owner as IndependentOperationLineageBackup);}}
}
export type RestoredOperationInput=Awaited<ReturnType<typeof readRestoredOperationInput>>;
