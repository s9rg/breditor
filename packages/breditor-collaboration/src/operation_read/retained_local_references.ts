/** Validate every retained local cut against the genuine imported native base.
 * Digest order is not edit order: each historical row continues the base, not
 * the preceding digest. Do not resurrect these rows as CURRENT or LIVE. */
import type {RetainedOperationCut} from './retained_cuts.js';
import type {IndependentHistoryCut,SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation} from '../independent_local_operation/portable_replay.js';
import {localPortableReferences} from '../independent_local_operation/portable_references.js';
import {SharedEditorError} from '../core.js';
export async function retainedLocalReferences(rows:readonly RetainedOperationCut[]|undefined,original:SharedIndependentHistoryRecovery,expected:SharedIndependentParticipantSelection,factory:SharedIndependentRecoveryFactory,recover:(cut:IndependentHistoryCut)=>Promise<SharedIndependentHistoryRecovery>,check:()=>void){
 if(!rows)throw new SharedEditorError('record_payload_source','The full journal read must retain every admitted typed cut');
 const base=await replayLocalOperationRecovery(expected,factory,original,check),result=[];
 try{for(const row of rows){check();const data=await recover(row.cut);check();const read=await replayLocalOperationRecovery(expected,factory,data,check);try{verifyLocalOperationContinuation(read,base);result.push({id:row.id,...localPortableReferences(read.core,data,read.check)});read.check();}finally{read.dispose();}check();}return result;}finally{base.dispose();}
}
