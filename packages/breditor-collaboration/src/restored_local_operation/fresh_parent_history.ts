/** Snapshot parent and source read admission; the snapshot family, literal
 * whole-file identity and independent native reader selection remain explicit. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {RestoredLocalParticipantState} from './participant_state.js';
import type {LocalOperationReadOptions} from '../independent_local_operation/portable_policy.js';
import {captureLocalInputOperationReferences,type LocalInputReferenceMetadata} from '../native_input_operation/reference_capture.js';
import {readSnapshotLocalParentRecords} from './read_parent_records.js';
import {restoredLocalUploads,readRestoredLocalUploadStore} from './participant_assets.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {snapshotFreshFactoryOptions} from '../operation_read/read_factory_snapshot.js';
import {composeFreshParentHistory,type FreshParentHistoryMetadata} from '../operation_read/fresh_parent_history.js';
import {createFreshParentHistoryReservation,type FreshParentHistoryReservation} from '../operation_read/fresh_parent_reservation.js';
import type {ParentReferenceProducer} from '../operation_read/reference_read.js';
import {restoredLocalFailure as fail} from './failure.js';
export type FreshSnapshotLocalHistoryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<LocalOperationReadOptions<P>,'checkAuthority'|'signal'>;
export type FreshSnapshotLocalHistoryMetadata=FreshParentHistoryMetadata<Awaited<ReturnType<typeof readSnapshotLocalParentRecords>>,LocalInputReferenceMetadata>;
export type FreshSnapshotLocalHistoryRead=FreshParentHistoryReservation<FreshSnapshotLocalHistoryMetadata>;
export function makeFreshSnapshotLocalHistoryRead<P extends SharedSelectionPolicy>(s:RestoredLocalParticipantState<P>,held:()=>void,unlock:()=>void,provided:FreshSnapshotLocalHistoryOptions<P>,providedAuthority:()=>void,signal?:AbortSignal):FreshSnapshotLocalHistoryRead{
 const input=snapshotFreshFactoryOptions(provided),session=snapshotIndependentRecoveryFactory(s.choice.expected.original,input.session),limits=checkRichAssetLimits(input.limits??s.choice.read.options.limits),authority=participantAuthority(providedAuthority),source=s.source,port=independentHistoryNative(source);let observation:OperationalReadCancellation|undefined;
 const current=()=>{held();if(s.life.changed||s.inputDisposed||!s.db||s.source!==source||globalThis.indexedDB!==s.context||globalThis.navigator?.locks!==s.locks)throw fail('restored_local_participant_storage_changed');checkRecoveryLeasesHeld(s.leases);port.checkManaged();restoredLocalUploads.check.call(s.uploads);observation?.check(()=>fail('restored_local_participant_aborted'));},check=()=>{current();authority();current();};
 return createFreshParentHistoryReservation({current,uploads:()=>{current();return readRestoredLocalUploadStore(s.uploads);},release:()=>{try{observation?.close();}finally{unlock();}},open:async()=>{observation=new OperationalReadCancellation(signal);check();const parent=await readSnapshotLocalParentRecords(s,check);check();let capture:Awaited<ReturnType<typeof captureLocalInputOperationReferences>>|undefined,result:ParentReferenceProducer<FreshSnapshotLocalHistoryMetadata>|undefined,complete=false;
  try{capture=await captureLocalInputOperationReferences({source,session,limits,checkAuthority:check,...(signal?{signal}:{})});check();if(capture.metadata().inputKind!=='snapshot-v1')throw fail('restored_local_participant_input_changed');result=composeFreshParentHistory('local-operation-snapshot',parent,capture,current,async()=>{const actual=await readSnapshotLocalParentRecords(s,check);check();if(JSON.stringify(actual)!==JSON.stringify(parent))throw fail('restored_local_participant_record');});complete=true;return result;}
  finally{if(!complete){if(result)result.dispose();else capture?.dispose();}}
 }});
}
