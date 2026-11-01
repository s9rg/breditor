/** Recreate every original packet occurrence and receipt comparison from the
 * exact saved points and genuine readonly Native aliases. Incoming point counts,
 * source labels and digests are claims until this complete traversal matches. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import type {LocalMetadataDeliverySnapshot} from '../selected_local_metadata_delivery/contract.js';
import type {LocalMetadataReceiptContainmentRead} from '../metadata_receipt_containment/contract.js';
import type {SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import type {SharedIndependentDeliveryRecoveryFactory} from '../independent_delivery_recovery/contract.js';
import {metadataRecordPoints} from '../metadata_receipt_containment/record_points.js';
import {visitOriginalReceiptPoints} from '../metadata_receipt_containment/origins.js';
import {OriginalReceiptComparison} from '../metadata_receipt_containment/compare.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {MetadataPacketArchive} from '../metadata_packet_retention/archive.js';
import {admitRecordedMetadataCatalog} from '../metadata_packet_retention/catalog_data.js';
import {MAX_METADATA_PACKET_OCCURRENCES,type MetadataPacketLocalOccurrence} from '../metadata_packet_retention/contract.js';
import {visitRetainedPacketNative} from './visit.js';
import {replayRetainedMetadataPacketReferences} from './references.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
const header=MetadataPacketArchive.prototype.header;
export async function inspectArchivedMetadataPacketOccurrences(source:Loaded,archive:MetadataPacketArchive,snapshot:LocalMetadataDeliverySnapshot,sources:Parameters<typeof replayRetainedMetadataPacketReferences>[2],recorded:LocalMetadataReceiptContainmentRead,options:SharedArchiveIntegrityOptions,assets:SharedAssetBytesOptions,check:()=>void){
 check();source.check();const selected=header.call(archive),integrity=prepareArchiveIntegrity(options),signal=options.signal??new AbortController().signal,local:MetadataPacketLocalOccurrence[]=[];
 const guard=()=>{check();source.check();integrity.guard();if(header.call(archive)!==selected)throw fail();};
 const index=await admitRecordedMetadataCatalog(selected.catalog,selected.catalog.selection,selected.catalog.selection.source.server.native.source.document,guard);guard();
 if(!same(selected.catalog,recorded.catalog))throw fail();const first=selected.catalog.pages[0];if(!first)throw fail();const comparison=new OriginalReceiptComparison(index,first.metadata,selected.catalog.terminal,selected.catalog.selection.source.server.native.source.document,guard);
 const key=async(kind:string,text:string)=>{guard();if(typeof text!=='string')throw fail();const result=kind+':'+await integrity.digest(new Blob([JSON.stringify(text)]));guard();return result;};
 const add=(value:MetadataPacketLocalOccurrence)=>{if(local.length>=MAX_METADATA_PACKET_OCCURRENCES)throw fail('metadata_packet_retention_budget');local.push(value);};
 for(const member of sources){
  guard();await visitRetainedPacketNative(source,{...member,assets},async alias=>{
   const current=()=>{guard();alias.check();},entry=source.participant(member.id),payload=await source.records(member.id);current();
   const visit=async(point:string,records:SegmentedRetainedRecords)=>{
    current();comparison.inspect(member.id,point,alias.core,records);current();
    for(const[index,value]of(records.versions?.packets??[]).entries())add({participant:member.id,point,store:'versions',index,body:await key('version',value.packet),previousBody:null});
    for(const[index,value]of(records.suggestions?.retained??[]).entries())add({participant:member.id,point,store:'suggestions',index,body:await key('suggestion',value.packet),previousBody:null});
    for(const[index,value]of(records.revisions?.retained??[]).entries())add({participant:member.id,point,store:'revisions',index,body:await key('revision',value.packet),previousBody:await key('suggestion',value.previousPacket)});current();
   };
   for(const point of metadataRecordPoints(entry.family,payload)){await visit(point.point,point.records);current();}
   const factory=member.read as {session?:SharedIndependentDeliveryRecoveryFactory};
   await visitOriginalReceiptPoints(source.nativeCut(),member.id,entry.family,payload,factory.session,signal,current,visit);current();
   for(const[label,state]of[['local-before',snapshot.before],['local-current',snapshot.current]]as const){const lane=state.lanes.find(row=>row.id===member.id);if(lane){await visit(label,lane.records);current();}}
   current();
  });guard();
 }
 const result=comparison.result();if(!same(local,selected.local)||!same(result.points,recorded.points)||!same(result.pending,recorded.pending))throw fail();guard();return Object.freeze({localOccurrences:local.length,receiptPoints:result.points.length,pendingOriginalReceipts:result.pending.length});
}
