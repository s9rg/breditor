/** Trusted private-parent composition. Original writer guards are never called;
 * actual parent/recovery bytes and actual source journal/history are checked. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {LocalParticipantState} from './participant_state.js';
import type {LocalOperationReadOptions} from './portable_policy.js';
import {captureLocalOperationReferences,type LocalOperationReferenceMetadata} from './reference_capture.js';
import {readLocalParentRecords} from './read_parent_records.js';
import {checkLocalUploads} from './participant_assets.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {snapshotFreshFactoryOptions} from '../operation_read/read_factory_snapshot.js';
import {composeFreshParentHistory,type FreshParentHistoryMetadata} from '../operation_read/fresh_parent_history.js';
import {createFreshParentHistoryReservation,type FreshParentHistoryReservation} from '../operation_read/fresh_parent_reservation.js';
import type {ParentReferenceProducer} from '../operation_read/reference_read.js';
import {localJournalFailure as fail} from './journal_failure.js';
export type FreshLocalParentHistoryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<LocalOperationReadOptions<P>,'checkAuthority'|'signal'>;
export type FreshLocalParentHistoryMetadata=FreshParentHistoryMetadata<Awaited<ReturnType<typeof readLocalParentRecords>>,LocalOperationReferenceMetadata>;
export type FreshLocalParentHistoryRead=FreshParentHistoryReservation<FreshLocalParentHistoryMetadata>;
export function makeFreshLocalParentHistoryRead<P extends SharedSelectionPolicy>(s:LocalParticipantState<P>,held:()=>void,unlock:()=>void,provided:FreshLocalParentHistoryOptions<P>,providedAuthority:()=>void,signal?:AbortSignal):FreshLocalParentHistoryRead{
 const input=snapshotFreshFactoryOptions(provided),session=snapshotIndependentRecoveryFactory(s.p.options.expected,input.session),limits=checkRichAssetLimits(input.limits??s.p.options.limits),authority=participantAuthority(providedAuthority),source=s.owners.session,uploads=s.owners.uploads;if(!source||!uploads)throw fail('independent_local_participant_missing');const port=independentHistoryNative(source);let observation:OperationalReadCancellation|undefined;
 const current=()=>{held();s.choice.readCurrent();if(s.owners.session!==source||s.owners.uploads!==uploads||!s.parentDb||!s.recoveryDb)throw fail('independent_local_participant_source_changed');checkRecoveryLeasesHeld(s.leases);port.checkManaged();checkLocalUploads(s.owners);observation?.check(()=>fail('independent_local_operation_reference_aborted'));},check=()=>{current();authority();current();};
 return createFreshParentHistoryReservation({current,uploads:()=>{current();return uploads;},release:()=>{try{observation?.close();}finally{unlock();}},open:async()=>{observation=new OperationalReadCancellation(signal);check();const parent=await readLocalParentRecords(s,check,signal);check();let capture:Awaited<ReturnType<typeof captureLocalOperationReferences>>|undefined,result:ParentReferenceProducer<FreshLocalParentHistoryMetadata>|undefined,complete=false;
  try{capture=await captureLocalOperationReferences({source,session,limits,checkAuthority:check,...(signal?{signal}:{})});check();result=composeFreshParentHistory('independent-local',parent,capture,current,async()=>{const actual=await readLocalParentRecords(s,check,signal);check();if(JSON.stringify(actual)!==JSON.stringify(parent))throw fail('independent_local_participant_record');});complete=true;return result;}
  finally{if(!complete){if(result)result.dispose();else capture?.dispose();}}
 }});
}
