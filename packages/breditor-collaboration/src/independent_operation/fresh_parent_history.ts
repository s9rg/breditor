/** Fresh read admission of a genuine independent delivery parent. Its complete
 * packet/receipt identity is retained, never converted to local-only storage. */
import type {OperationalRecordReadMode} from '../operation_read/record_payload.js';
import {independentNativeRetention} from '../operation_read/native_retention.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentDeliveryParentCustody} from './participant.js';
import type {IndependentOperationReadOptions} from './portable_policy.js';
import {captureIndependentOperationReferences,type IndependentOperationReferenceMetadata} from './reference_capture.js';
import {readDeliveryParentRecords} from './read_parent_records.js';
import {checkOperationUploads} from './participant_assets.js';
import {independentDeliverySessionPort} from '../independent_delivery/admission.js';
import {snapshotIndependentDeliveryFactory} from '../independent_delivery_recovery/factory_policy.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {snapshotFreshFactoryOptions} from '../operation_read/read_factory_snapshot.js';
import {composeFreshParentHistory,type FreshParentHistoryMetadata} from '../operation_read/fresh_parent_history.js';
import {createFreshParentHistoryReservation,type FreshParentHistoryReservation} from '../operation_read/fresh_parent_reservation.js';
import type {ParentReferenceProducer} from '../operation_read/reference_read.js';
import {operationJournalFailure as fail} from './journal_failure.js';
export type FreshDeliveryParentHistoryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<IndependentOperationReadOptions<P>,'checkAuthority'|'signal'>;
export type FreshDeliveryParentHistoryMetadata=FreshParentHistoryMetadata<Awaited<ReturnType<typeof readDeliveryParentRecords>>,IndependentOperationReferenceMetadata>;
export type FreshDeliveryParentHistoryRead=FreshParentHistoryReservation<FreshDeliveryParentHistoryMetadata>;
export function makeFreshDeliveryParentHistoryRead<P extends SharedSelectionPolicy>(s:IndependentDeliveryParentCustody<P>,held:()=>void,unlock:()=>void,provided:FreshDeliveryParentHistoryOptions<P>,providedAuthority:()=>void,signal?:AbortSignal,mode?:OperationalRecordReadMode):FreshDeliveryParentHistoryRead{
 const input=snapshotFreshFactoryOptions(provided),session=snapshotIndependentDeliveryFactory(s.p.options.expected,input.session,true),limits=checkRichAssetLimits(input.limits??s.p.options.limits),authority=participantAuthority(providedAuthority),source=s.owners.session,uploads=s.owners.uploads;if(!source||!uploads)throw fail('independent_operation_missing');const managed=independentDeliverySessionPort(source).check;let observation:OperationalReadCancellation|undefined;let unpublished:Readonly<{dispose():void}>|undefined;
 const current=()=>{held();s.choice.readCurrent();if(s.owners.session!==source||s.owners.uploads!==uploads||s.recoveryDbClosed)throw fail('independent_operation_source_changed');checkRecoveryLeasesHeld(s.leases);managed();checkOperationUploads(s.owners);observation?.check(()=>fail('independent_operation_reference_aborted'));},check=()=>{current();authority();current();};
 return createFreshParentHistoryReservation({current,native:()=>independentNativeRetention(source,true,()=>{s.choice.readCurrent();if(s.owners.session!==source||s.owners.uploads!==uploads||s.recoveryDbClosed)throw fail('independent_operation_source_changed');checkRecoveryLeasesHeld(s.leases);managed();checkOperationUploads(s.owners);}),uploads:()=>{current();return uploads;},cleanupOpening:()=>{unpublished?.dispose();unpublished=undefined;},release:()=>{try{observation?.close();}finally{unlock();}},open:async()=>{observation=new OperationalReadCancellation(signal);check();const parent=await readDeliveryParentRecords(s.p,s.recoveryDb,check,signal);check();let capture:Awaited<ReturnType<typeof captureIndependentOperationReferences>>|undefined,result:ParentReferenceProducer<FreshDeliveryParentHistoryMetadata>|undefined,complete=false;
  try{capture=await captureIndependentOperationReferences({source,session,limits,checkAuthority:check,...(signal?{signal}:{})},mode);check();result=composeFreshParentHistory('independent-delivery',parent,capture,current,async()=>{const actual=await readDeliveryParentRecords(s.p,s.recoveryDb,check,signal);check();if(JSON.stringify(actual)!==JSON.stringify(parent))throw fail('independent_operation_recovery_diverged');});complete=true;return result;}
  finally{if(!complete)unpublished=result??capture;}
 }});
}
