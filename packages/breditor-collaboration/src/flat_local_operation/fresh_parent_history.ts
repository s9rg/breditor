/** Flat-local parent/native read, preserving manifest identity and imported
 * provenance. No snapshot conversion, writable guard or upload release occurs. */
import type {OperationalRecordReadMode} from '../operation_read/record_payload.js';
import {independentNativeRetention} from '../operation_read/native_retention.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {FlatLocalParticipantState} from './participant_state.js';
import type {LocalOperationReadOptions} from '../independent_local_operation/portable_policy.js';
import {captureLocalInputOperationReferences,type LocalInputReferenceMetadata} from '../native_input_operation/reference_capture.js';
import {readFlatLocalParentRecords} from './read_parent_records.js';
import {nativeInputUploads,readNativeInputUploadStore} from '../native_input_operation/participant_uploads.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {snapshotFreshFactoryOptions} from '../operation_read/read_factory_snapshot.js';
import {composeFreshParentHistory,type FreshParentHistoryMetadata} from '../operation_read/fresh_parent_history.js';
import {createFreshParentHistoryReservation,type FreshParentHistoryReservation} from '../operation_read/fresh_parent_reservation.js';
import type {ParentReferenceProducer} from '../operation_read/reference_read.js';
import {flatLocalFailure as fail} from './failure.js';
export type FreshFlatLocalHistoryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<LocalOperationReadOptions<P>,'checkAuthority'|'signal'>;
export type FreshFlatLocalHistoryMetadata=FreshParentHistoryMetadata<Awaited<ReturnType<typeof readFlatLocalParentRecords>>,LocalInputReferenceMetadata>;
export type FreshFlatLocalHistoryRead=FreshParentHistoryReservation<FreshFlatLocalHistoryMetadata>;
export function makeFreshFlatLocalHistoryRead<P extends SharedSelectionPolicy>(s:FlatLocalParticipantState<P>,held:()=>void,unlock:()=>void,provided:FreshFlatLocalHistoryOptions<P>,providedAuthority:()=>void,signal?:AbortSignal,mode?:OperationalRecordReadMode):FreshFlatLocalHistoryRead{
 const input=snapshotFreshFactoryOptions(provided),session=snapshotIndependentRecoveryFactory(s.choice.expected.original,input.session),limits=checkRichAssetLimits(input.limits??s.choice.read.options.limits),authority=participantAuthority(providedAuthority),source=s.source,port=independentHistoryNative(source);let observation:OperationalReadCancellation|undefined;let unpublished:Readonly<{dispose():void}>|undefined;
 const current=()=>{held();if(s.life.changed||s.inputDisposed||!s.db||s.source!==source||globalThis.indexedDB!==s.context||globalThis.navigator?.locks!==s.locks)throw fail('flat_local_input_participant_storage_changed');checkRecoveryLeasesHeld(s.leases);port.checkManaged();nativeInputUploads.check.call(s.uploads);observation?.check(()=>fail('flat_local_input_participant_aborted'));},check=()=>{current();authority();current();};
 return createFreshParentHistoryReservation({current,native:()=>independentNativeRetention(source,false,()=>{if(s.life.changed||s.inputDisposed||!s.db||s.source!==source||globalThis.indexedDB!==s.context||globalThis.navigator?.locks!==s.locks)throw fail('flat_local_input_participant_storage_changed');checkRecoveryLeasesHeld(s.leases);port.checkManaged();nativeInputUploads.check.call(s.uploads);}),uploads:()=>{current();return readNativeInputUploadStore(s.uploads);},cleanupOpening:()=>{unpublished?.dispose();unpublished=undefined;},release:()=>{try{observation?.close();}finally{unlock();}},open:async()=>{observation=new OperationalReadCancellation(signal);check();const parent=await readFlatLocalParentRecords(s,check);check();let capture:Awaited<ReturnType<typeof captureLocalInputOperationReferences>>|undefined,result:ParentReferenceProducer<FreshFlatLocalHistoryMetadata>|undefined,complete=false;
  try{capture=await captureLocalInputOperationReferences({source,session,limits,checkAuthority:check,...(signal?{signal}:{})},mode);check();if(capture.metadata().inputKind!=='flat-local-v1')throw fail('flat_local_input_participant_input_changed');result=composeFreshParentHistory('local-operation-flat',parent,capture,current,async()=>{const actual=await readFlatLocalParentRecords(s,check);check();if(JSON.stringify(actual)!==JSON.stringify(parent))throw fail('flat_local_input_participant_record');});complete=true;return result;}
  finally{if(!complete)unpublished=result??capture;}
 }});
}
