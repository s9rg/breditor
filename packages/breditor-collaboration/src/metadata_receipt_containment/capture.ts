/** Runs only within the genuine metadata owner's quiesced all-family capture. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {RetainedDeliveryClient} from '../complete_operation_cohort/retained_native_read.js';
import type {LocalMetadataDeliverySnapshot} from '../selected_local_metadata_delivery/contract.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import type {PreparedLocalMetadataReconciliation} from '../selected_local_metadata_assets/reconciliation_input.js';
import type {LocalMetadataReconciliationRead} from '../selected_local_metadata_assets/reconciliation_contract.js';
import type {SharedIndependentDeliveryRecoveryFactory} from '../independent_delivery_recovery/contract.js';
import {captureSelectedServerMetadata,withCheckedServerMetadataCatalog} from '../server_metadata_read/collect.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {OriginalReceiptComparison} from './compare.js';
import {metadataRecordPoints} from './record_points.js';
import {visitOriginalReceiptPoints} from './origins.js';
import type {LocalMetadataReceiptContainmentRead} from './contract.js';
import {same,fail} from './policy.js';
const readRecords=PhysicalRoomRecordCutArchive.prototype.records;
export async function captureOriginalReceiptContainment(scope:SelectedNativeRecoveryScope,sources:readonly RetainedDeliveryClient[],snapshot:LocalMetadataDeliverySnapshot,cut:PhysicalRoomRecordCutArchive,input:PreparedLocalMetadataReconciliation,reconciliation:LocalMetadataReconciliationRead,factories:readonly {id:string;read:unknown}[],check:()=>void):Promise<LocalMetadataReceiptContainmentRead>{
 check();input.check();const query={versions:{kind:typeof input.metadata.versionsBinding==='string'?'start' as const:'disabled' as const},suggestions:{kind:typeof input.metadata.suggestionsBinding==='string'?'start' as const:'disabled' as const},revisions:{kind:typeof input.metadata.revisionsBinding==='string'?'start' as const:'disabled' as const}};
 const catalog=await captureSelectedServerMetadata(input.host,query,scope.signal);check();input.check();
 if(!same(catalog.selection,input.port.selection.current)||catalog.pages.length===0)throw fail('metadata_receipt_binding');
 const result=await withCheckedServerMetadataCatalog(catalog,async index=>{
  const comparison=new OriginalReceiptComparison(index,catalog.pages[0]!.metadata,catalog.terminal,input.metadata.room.document,check);
  for(const row of sources){
   check();row.source.check();const payload=await readRecords.call(cut,row.id);check();
   for(const point of metadataRecordPoints(row.family,payload))comparison.inspect(row.id,point.point,row.source.core,point.records);
   const factory=factories.find(value=>value.id===row.id)?.read as {session?:SharedIndependentDeliveryRecoveryFactory}|undefined;
   await visitOriginalReceiptPoints(cut,row.id,row.family,payload,factory?.session,scope.signal,check,(point,records)=>comparison.inspect(row.id,point,row.source.core,records));check();
   for(const [label,state]of [['local-before',snapshot.before],['local-current',snapshot.current]] as const){const lane=state.lanes.find(value=>value.id===row.id);if(lane)comparison.inspect(row.id,label,row.source.core,lane.records);}
   row.source.check();check();
  }
  return comparison.result();
 });check();input.check();
 return frozen({format:'breditor/selected-local-metadata-receipt-containment',formatVersion:1,scope:'same-held-native-original-local-receipts-in-current-server-catalogs',kind:reconciliation.kind==='checked'&&!result.pending.length?'contained':'pending',reconciliation,catalog,...result});
}
