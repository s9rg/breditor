/** Actual source/journal and whole-upload checks, never old complete-format export or a DTO. */
import {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import type {PreparedIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import {operationJournalBinding,type IndependentOperationCutJournal} from './cut_journal.js';
import {checkOperationUploads,verifyOperationUploads,operationUploadCustody,type OperationUploadOwners} from './participant_assets.js';
import {readJournaledSourceData} from './open_journaled_source.js';
import {operationJournalFailure as fail} from './journal_failure.js';
import type {SharedSelectionPolicy} from '../types.js';
export interface OperationParticipantOwners<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends OperationUploadOwners {session?:SharedIndependentDeliverySession<P>}
const closeSource=SharedIndependentDeliverySession.prototype.close,discardSource=SharedIndependentDeliverySession.prototype.discardAndClose;
export async function verifyOperationParticipantOwners<P extends SharedSelectionPolicy>(p:PreparedIndependentDeliveryRecovery<P>,owners:OperationParticipantOwners<P>,journal:IndependentOperationCutJournal):Promise<void>{
 p.guard();if(!owners.session)throw fail('independent_operation_missing');const source=owners.session,port=independentDeliverySource(source),stamp=port.stamp(),data=readJournaledSourceData(source,journal),binding=operationJournalBinding(journal);
 const check=()=>{p.guard();port.check();const now=port.stamp();if(now.length!==stamp.length||now.some((v,i)=>v!==stamp[i]))throw fail('independent_operation_source_changed');binding.nativeCaptureGuard.capture(port.core,data.source.versions);checkOperationUploads(owners);};check();await journal.snapshot();check();await verifyOperationUploads(p,owners,check);check();
}
/** Settle the real native owner before actual upload callbacks or coordinator leases are released. */
export async function closeOperationParticipantOwners<P extends SharedSelectionPolicy>(owners:OperationParticipantOwners<P>,discard:boolean):Promise<void>{
 if(owners.session)await(discard?discardSource:closeSource).call(owners.session);if(owners.uploadCustody)await operationUploadCustody.close.call(owners.uploadCustody);if(owners.uploads)operationUploadCustody.closeStore.call(owners.uploads);
}
