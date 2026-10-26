/** Normalize only independently admitted genuine archives. This is read-only data,
 * never an old completed recovery owner or a serialized source-factory selector. */
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentOperationReadOptions} from '../independent_operation/portable_policy.js';
import type {IndependentOperationBackupSelection} from '../independent_operation/portable_contract.js';
import {IndependentOperationBackup,portableOperationArchive as snapshot} from '../independent_operation/portable_backup.js';
import {IndependentOperationLineageBackup,operationLineageArchive as lineage} from '../independent_operation/lineage_archive.js';
import {RestoredOperationGraphArchive,restoredGraphArchive as graph} from '../restored_graph/archive.js';
import {checkRestoredOperationInputBudget} from '../restored_graph/limits.js';
import {flattenRestoredGraphInput} from '../restored_graph/flatten_input.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
export type RestoredOperationInputKind='snapshot-v1'|'lineage-v1'|'lineage-v2';
export async function readRestoredInputArchive<P extends SharedSelectionPolicy>(kind:RestoredOperationInputKind,file:Blob,expected:IndependentOperationBackupSelection,options:IndependentOperationReadOptions<P>){
 if(!['snapshot-v1','lineage-v1','lineage-v2'].includes(kind))throw fail('restored_operation_policy');
 if(kind==='lineage-v2')checkRestoredOperationInputBudget(file);
 if(kind==='snapshot-v1'){
  const owner=await snapshot.read.call(IndependentOperationBackup,file,expected,options);let complete=false;
  try{const value={selection:snapshot.selection.call(owner),file:snapshot.file.call(owner),original:snapshot.originalFile.call(owner),metadata:snapshot.metadata.call(owner),originalData:snapshot.originalRecovery(owner),live:snapshot.live.call(owner),current:snapshot.current.call(owner),pending:snapshot.pending.call(owner),uploads:snapshot.uploads.call(owner),uploadEntries:snapshot.entries.call(owner),blob:(asset:string,generation:string)=>snapshot.blob.call(owner,asset,generation),flatten:(check:()=>void)=>flattenRestoredGraphInput({kind:"snapshot-v1",owner},check),dispose:()=>snapshot.dispose.call(owner)};complete=true;return value;}finally{if(!complete)snapshot.dispose.call(owner);}
 }
 if(kind==='lineage-v1'){
  const owner=await lineage.read.call(IndependentOperationLineageBackup,file,expected,options);let complete=false;
  try{const value={selection:lineage.selection.call(owner),file:lineage.file.call(owner),original:lineage.original.call(owner),metadata:lineage.latestMetadata(owner),originalData:lineage.originalRecovery(owner),live:lineage.live.call(owner),current:lineage.current.call(owner),pending:lineage.pending.call(owner),uploads:lineage.uploads.call(owner),uploadEntries:lineage.entries.call(owner),blob:(asset:string,generation:string)=>lineage.blob.call(owner,asset,generation),flatten:(check:()=>void)=>flattenRestoredGraphInput({kind:"lineage-v1",owner},check),dispose:()=>lineage.dispose.call(owner)};complete=true;return value;}finally{if(!complete)lineage.dispose.call(owner);}
 }
 const owner=await graph.read.call(RestoredOperationGraphArchive,file,expected,options);let complete=false;
 try{const value={selection:graph.selection.call(owner),file:graph.file.call(owner),original:graph.original.call(owner),metadata:graph.latestMetadata.call(owner),originalData:graph.originalRecovery.call(owner),live:graph.live.call(owner),current:graph.current.call(owner),pending:graph.pending.call(owner),uploads:graph.uploads.call(owner),uploadEntries:graph.entries.call(owner),blob:(asset:string,generation:string)=>graph.blob.call(owner,asset,generation),flatten:(check:()=>void)=>flattenRestoredGraphInput({kind:"lineage-v2",owner},check),dispose:()=>graph.dispose.call(owner)};complete=true;return value;}finally{if(!complete)graph.dispose.call(owner);}
}
