/** Closed, complete input admission for reference reads. Input provenance is
 * not reduced to its latest LIVE. Original raster admission is unchanged. */
import type {SharedSelectionPolicy} from '../types.js';
import type {LocalOperationReadOptions} from '../independent_local_operation/portable_policy.js';
import type {LocalOperationBackupSelection} from '../independent_local_operation/portable_contract.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import {IndependentLocalOperationBackup,portableLocalOperationArchive as snapshot} from '../independent_local_operation/portable_backup.js';
import {localPortableCutRecovery} from '../independent_local_operation/portable_cut.js';
import {FlatLocalArchive,flatLocalArchive as flat} from '../flat_local_operation/archive.js';
export async function readLocalInputReferenceStates<P extends SharedSelectionPolicy>(kind:'snapshot-v1'|'flat-local-v1',file:Blob,expected:LocalOperationBackupSelection,options:LocalOperationReadOptions<P>){
 if(kind==='snapshot-v1'){
  const owner=await snapshot.read.call(IndependentLocalOperationBackup,file,expected,options);
  try{const header=snapshot.metadata.call(owner),states:SharedIndependentHistoryRecovery[]=[snapshot.originalRecovery(owner)];for(const cut of[snapshot.current.call(owner),snapshot.pending.call(owner)])if(cut)states.push(await localPortableCutRecovery(header.operation,cut));states.push(snapshot.live.call(owner));return{states,bindings:header.bindings};}finally{snapshot.dispose.call(owner);}
 }
 const owner=await flat.read.call(FlatLocalArchive,file,expected,options);
 try{return{states:flat.targets.call(owner),bindings:flat.metadata.call(owner).bindings};}finally{flat.dispose.call(owner);}
}
