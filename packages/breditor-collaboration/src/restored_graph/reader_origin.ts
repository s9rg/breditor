/** Both graph ancestry anchors in the independently selected reader runtime.
 * The historical original cannot stand in for the newer imported input-LIVE.
 * This issues only temporary read checks, never author, storage or relay grants. */
import {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryOptions,SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {IndependentOperationBackup,portableOperationArchive as snapshot} from '../independent_operation/portable_backup.js';
import {IndependentOperationLineageBackup,operationLineageArchive as lineage} from '../independent_operation/lineage_archive.js';
import {replayPortableRecovery} from '../independent_operation/portable_replay.js';
import {portableRecoveryReferences} from '../independent_operation/portable_references.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
import {RestoredOperationGraphArchive,restoredGraphArchive as graph} from './archive.js';

export type RestoredGraphReaderInput=
 |Readonly<{kind:'snapshot-v1';owner:IndependentOperationBackup}>
 |Readonly<{kind:'lineage-v1';owner:IndependentOperationLineageBackup}>
 |Readonly<{kind:'lineage-v2';owner:RestoredOperationGraphArchive}>;
const verifyOriginal=SharedRichEditor.prototype.verifyRecoveryOrigin,verifySegmented=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;

/** Canonical archive readers admit genuine handles, not incoming summaries.
 * Keep both replay owners local to this factory's instance. The live writer's
 * journal independently verifies its own source in its original runtime. */
export async function restoredGraphReaderOrigin(input:RestoredGraphReaderInput,originalData:SharedIndependentDeliveryRecovery,factory:SharedIndependentDeliveryOptions,check:()=>void){
 const original=await replayPortableRecovery(factory,originalData,check);let live:Awaited<ReturnType<typeof replayPortableRecovery>>|undefined;
 try{
  const data=input.kind==='snapshot-v1'?snapshot.live.call(input.owner):input.kind==='lineage-v1'?lineage.live.call(input.owner):graph.live.call(input.owner);
  live=await replayPortableRecovery(factory,data,check);const inputLive=live,references=portableRecoveryReferences(original.core,originalData,original.check);let closed=false;
  const current=()=>{if(closed)throw fail('restored_graph_reader_origin_closed');check();original.check();inputLive.check();check();};
  current();return Object.freeze({originalReferences:references,
   verify(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[]):void{
    current();const verify=originalData.source.identity.documentHistory==='original'?verifyOriginal:verifySegmented;
    verify.call(core,original.core);for(const packet of originalData.source.versions)if(!versions.includes(packet))throw fail('restored_operation_origin');
    verify.call(core,inputLive.core);for(const packet of data.source.versions)if(!versions.includes(packet))throw fail('restored_operation_origin');current();
   },
   dispose():void{if(closed)return;closed=true;try{inputLive.dispose();}finally{original.dispose();}},
  });
 }catch(error){try{live?.dispose();}finally{original.dispose();}throw error;}
}
