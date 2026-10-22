/** A restored-local save must continue the imported LIVE, not merely share its
 * historical original. Native replay also checks both lanes and ordered versions.
 * Hash admission alone cannot establish these relationships. */
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryStoredCut} from '../independent_history/contract.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import {copyOperationCut,readOperationCut,operationCutDigest} from '../independent_operation/cut_codec.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation,type LocalPortableReplay} from '../independent_local_operation/portable_replay.js';
import {readRestoredLocalHead,type RestoredLocalIdentity} from './head.js';
import type {RestoredLocalJournalStored} from './database.js';
import {restoredLocalFailure as fail} from './failure.js';

export async function admitRestoredLocalCuts<P extends SharedSelectionPolicy>(
 stored:RestoredLocalJournalStored,id:RestoredLocalIdentity,
 selected:SharedIndependentParticipantSelection,factory:SharedIndependentRecoveryFactory<P>,
 anchor:LocalPortableReplay,guard:()=>void,
){
 const rows=new Map<string,ReturnType<typeof copyOperationCut>>(),decoded=new Map<string,IndependentHistoryStoredCut>();
 const owned:LocalPortableReplay[]=[];let preceding=anchor;
 try{
  for(const hash of [stored.record.current,stored.record.pending]){
   if(hash===null)continue;
   const cut=await readOperationCut(stored.rows.get(hash),head=>readRestoredLocalHead(head,id));guard();
   if(await operationCutDigest(cut)!==hash)throw fail('restored_local_operation_cut');guard();
   const recovery={format:'breditor/shared-independent-history-recovery' as const,formatVersion:1 as const,identity:cut.record.identity,documentCheckpoint:cut.documentCheckpoint,reviewCheckpoint:cut.reviewCheckpoint,versions:cut.record.versions};
   const replay=await replayLocalOperationRecovery(selected,factory,recovery,guard);owned.push(replay);guard();
   verifyLocalOperationContinuation(replay,preceding);guard();preceding=replay;
   rows.set(hash,copyOperationCut(cut));decoded.set(hash,cut);
  }
  guard();return{...stored,rows,decoded};
 }finally{
  let failed=false;for(const replay of [...owned].reverse())try{replay.dispose();}catch{failed=true;}
  if(failed)throw fail('restored_local_operation_cleanup');
 }
}
