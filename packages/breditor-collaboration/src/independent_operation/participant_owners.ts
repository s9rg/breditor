/** Actual source/journal and whole-upload checks, never old complete-format export or a DTO. */
import {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {independentDeliverySessionPort} from '../independent_delivery/admission.js';
import type {PreparedIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import {operationJournalBinding,type IndependentOperationCutJournal} from './cut_journal.js';
import {checkOperationUploads,verifyOperationUploads,operationUploadCustody,type OperationUploadOwners} from './participant_assets.js';
import {operationJournalFailure as fail} from './journal_failure.js';
import type {SharedSelectionPolicy} from '../types.js';
export interface OperationParticipantOwners<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends OperationUploadOwners {session?:SharedIndependentDeliverySession<P>}
const closeSource=SharedIndependentDeliverySession.prototype.close,discardSource=SharedIndependentDeliverySession.prototype.discardAndClose;
export async function verifyOperationParticipantOwners<P extends SharedSelectionPolicy>(p:PreparedIndependentDeliveryRecovery<P>,owners:OperationParticipantOwners<P>,journal:IndependentOperationCutJournal):Promise<void>{
 const witness=await operationParticipantWitness(p,owners,journal);try{witness.check();}finally{witness.release();}
}
/** Borrow actual journal/origin lifetime and preserve every native and companion
 * epoch through cleanup and the last callback-free multi-member comparison. */
export async function operationParticipantWitness<P extends SharedSelectionPolicy>(p:PreparedIndependentDeliveryRecovery<P>,owners:OperationParticipantOwners<P>,journal:IndependentOperationCutJournal){
 p.guard();if(!owners.session)throw fail('independent_operation_missing');const source=owners.session,port=independentDeliverySource(source),managed=independentDeliverySessionPort(source).check,scope=operationJournalBinding(journal).borrowRead(source,p.guard,p.options.signal);let returned=false;
 try{
  const data=scope.readSource(),stamp=port.stamp(),current=()=>{scope.checkCurrent();managed();checkOperationUploads(owners);const now=port.stamp();if(now.length!==stamp.length||now.some((v,i)=>v!==stamp[i]))throw fail('independent_operation_source_changed');};
  const check=()=>{scope.check();current();const actual=port.read();if(JSON.stringify(actual)!==JSON.stringify(data))throw fail('independent_operation_source_changed');current();};
  check();await scope.readSnapshot();check();await verifyOperationUploads(p,owners,check);check();const result={data,check,current,release:scope.release};check();returned=true;return result;
 }finally{if(!returned)scope.release();}
}
/** Settle the real native owner before actual upload callbacks or coordinator leases are released. */
export async function closeOperationParticipantOwners<P extends SharedSelectionPolicy>(owners:OperationParticipantOwners<P>,discard:boolean):Promise<void>{
 if(owners.session)await(discard?discardSource:closeSource).call(owners.session);if(owners.uploadCustody)await operationUploadCustody.close.call(owners.uploadCustody);if(owners.uploads)operationUploadCustody.closeStore.call(owners.uploads);
}
