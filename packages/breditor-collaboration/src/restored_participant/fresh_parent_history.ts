/** Genuine coordinated graph read: literal parent input plus every retained
 * original/input/current/pending/LIVE native and packet state. No old job hook. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {RestoredDeliveryParentCustody} from './participant.js';
import type {IndependentOperationReadOptions} from '../independent_operation/portable_policy.js';
import {captureRestoredGraphReferences,type RestoredGraphReferenceMetadata} from '../restored_graph/reference_capture.js';
import {readRestoredDeliveryParentRecords} from './read_parent_records.js';
import {checkRestoredUploads} from './uploads.js';
import {independentDeliverySessionPort} from '../independent_delivery/admission.js';
import {snapshotIndependentDeliveryFactory} from '../independent_delivery_recovery/factory_policy.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {snapshotFreshFactoryOptions} from '../operation_read/read_factory_snapshot.js';
import {composeFreshParentHistory,type FreshParentHistoryMetadata} from '../operation_read/fresh_parent_history.js';
import {createFreshParentHistoryReservation,type FreshParentHistoryReservation} from '../operation_read/fresh_parent_reservation.js';
import type {ParentReferenceProducer} from '../operation_read/reference_read.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
export type FreshRestoredDeliveryHistoryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<IndependentOperationReadOptions<P>,'checkAuthority'|'signal'>;
export type FreshRestoredDeliveryHistoryMetadata=FreshParentHistoryMetadata<Awaited<ReturnType<typeof readRestoredDeliveryParentRecords>>,RestoredGraphReferenceMetadata>;
export type FreshRestoredDeliveryHistoryRead=FreshParentHistoryReservation<FreshRestoredDeliveryHistoryMetadata>;
export function makeFreshRestoredDeliveryHistoryRead<P extends SharedSelectionPolicy>(s:RestoredDeliveryParentCustody<P>,held:()=>void,unlock:()=>void,provided:FreshRestoredDeliveryHistoryOptions<P>,providedAuthority:()=>void,signal?:AbortSignal):FreshRestoredDeliveryHistoryRead{
 const input=snapshotFreshFactoryOptions(provided),session=snapshotIndependentDeliveryFactory(s.input.selection.original,input.session,true),limits=checkRichAssetLimits(input.limits??s.input.options.limits),authority=participantAuthority(providedAuthority),pair=s.pair;if(!pair)throw fail('restored_participant_not_ready');const managed=independentDeliverySessionPort(pair.source).check;let observation:OperationalReadCancellation|undefined;
 const current=()=>{held();s.choice.readCurrent();if(s.pair!==pair||s.dbClosed||s.inputRetired||s.leasesReleased)throw fail('restored_participant_closed');checkRecoveryLeasesHeld(s.leases);managed();checkRestoredUploads(s.uploads);observation?.check(()=>fail('restored_graph_reference_aborted'));},check=()=>{current();authority();current();};
 return createFreshParentHistoryReservation({current,release:()=>{try{observation?.close();}finally{unlock();}},open:async()=>{observation=new OperationalReadCancellation(signal);check();const parent=await readRestoredDeliveryParentRecords(s.db,s.input,s.plan,check,signal);check();let capture:Awaited<ReturnType<typeof captureRestoredGraphReferences>>|undefined,result:ParentReferenceProducer<FreshRestoredDeliveryHistoryMetadata>|undefined,complete=false;
  try{capture=await captureRestoredGraphReferences({source:pair.source,session,limits,checkAuthority:check,...(signal?{signal}:{})});check();result=composeFreshParentHistory('restored-graph',parent,capture,current,async()=>{const actual=await readRestoredDeliveryParentRecords(s.db,s.input,s.plan,check,signal);check();if(JSON.stringify(actual)!==JSON.stringify(parent))throw fail('restored_participant_record');});complete=true;return result;}
  finally{if(!complete){if(result)result.dispose();else capture?.dispose();}}
 }});
}
