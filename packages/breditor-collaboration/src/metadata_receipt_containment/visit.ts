/** Shared literal-point traversal. Every asynchronous visitor finishes before
 * its original reader is disposed. No point is replaced by LIVE metadata. */
import type {RetainedDeliveryClient} from '../complete_operation_cohort/retained_native_read.js';
import type {LocalMetadataDeliverySnapshot} from '../selected_local_metadata_delivery/contract.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import type {SharedIndependentDeliveryRecoveryFactory} from '../independent_delivery_recovery/contract.js';
import type {SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import {metadataRecordPoints} from './record_points.js';
import {visitOriginalReceiptPoints} from './origins.js';
const records=PhysicalRoomRecordCutArchive.prototype.records;
export async function visitHeldMetadataRecordPoints(sources:readonly RetainedDeliveryClient[],snapshot:LocalMetadataDeliverySnapshot,cut:PhysicalRoomRecordCutArchive,factories:readonly{id:string;read:unknown}[],signal:AbortSignal,check:()=>void,visit:(source:RetainedDeliveryClient,point:string,records:SegmentedRetainedRecords)=>void|Promise<void>):Promise<void>{
 for(const row of sources){
  check();row.source.check();const payload=await records.call(cut,row.id);check();
  for(const point of metadataRecordPoints(row.family,payload)){await visit(row,point.point,point.records);check();}
  const factory=factories.find(value=>value.id===row.id)?.read as {session?:SharedIndependentDeliveryRecoveryFactory}|undefined;
  await visitOriginalReceiptPoints(cut,row.id,row.family,payload,factory?.session,signal,check,(point,value)=>visit(row,point,value));check();
  for(const[label,state]of [['local-before',snapshot.before],['local-current',snapshot.current]] as const){const lane=state.lanes.find(value=>value.id===row.id);if(lane){await visit(row,label,lane.records);check();}}
  row.source.check();check();
 }
}
