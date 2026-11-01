/** Discover only literal held LOCAL packets. Native IDs and references use
 * genuine current cores; no first-server packet or raster download is needed. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {RetainedDeliveryClient} from '../complete_operation_cohort/retained_native_read.js';
import type {LocalMetadataDeliverySnapshot,LocalMetadataDeliveryState} from '../selected_local_metadata_delivery/contract.js';
import type {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import {visitHeldMetadataRecordPoints} from '../metadata_receipt_containment/visit.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {MetadataPacketBodyStore} from '../metadata_packet_retention/body_store.js';
import {readRetainedMetadataPacketReferences} from '../metadata_packet_retention/native_references.js';
import {MAX_METADATA_PACKET_OCCURRENCES} from '../metadata_packet_retention/contract.js';
import type {CurrentLocalPacketReferences} from './contract.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fail} from '../metadata_packet_retention/policy.js';
export async function readCurrentLocalPacketReferences(scope:SelectedNativeRecoveryScope,sources:readonly RetainedDeliveryClient[],snapshot:LocalMetadataDeliverySnapshot,stored:LocalMetadataDeliveryState,cut:PhysicalRoomRecordCutArchive,factories:readonly{id:string;read:unknown}[],options:SharedArchiveIntegrityOptions,check:()=>void):Promise<CurrentLocalPacketReferences>{
 check();if(!sources.length||new Set(sources.map(row=>row.id)).size!==sources.length)throw fail();const store=new MetadataPacketBodyStore(prepareArchiveIntegrity({...options,checkAuthority:check}),check),parents=new Map<string,string>();let occurrences=0;
 const count=()=>{if(++occurrences>MAX_METADATA_PACKET_OCCURRENCES)throw fail('metadata_packet_retention_budget');};
 const visit=async(row:RetainedDeliveryClient,_point:string,records:SegmentedRetainedRecords)=>{
  check();row.source.check();
  for(const packet of records.versions?.packets??[]){count();await store.retain('version',packet.packet,row.source.core);check();}
  for(const packet of records.suggestions?.retained??[]){count();await store.retain('suggestion',packet.packet,row.source.core);check();}
  for(const packet of records.revisions?.retained??[]){count();const parent=await store.retain('suggestion',packet.previousPacket,row.source.core),body=await store.retain('revision',packet.packet,row.source.core,packet.previousPacket);parents.set(body.key,parent.key);check();}
  row.source.check();
 };
 await visitHeldMetadataRecordPoints(sources,snapshot,cut,factories,scope.signal,check,visit);check();
 // The separately admitted stored local cut is explicit, even when its records
 // also occur in before/current. A duplicate body never drops a point count.
 for(const lane of stored.lanes){const row=sources.find(value=>value.id===lane.id);if(!row)throw fail();await visit(row,'local-stored',lane.records);check();}
 const bodies=store.bodies();if(bodies.length>Math.floor(1000000/sources.length))throw fail('metadata_packet_retention_budget');
 const requirements=await readRetainedMetadataPacketReferences(sources.map(row=>({participant:row.id,core:row.source.core,check:()=>{check();row.source.check();}})),store,parents,check);check();
 return frozen({format:'breditor/current-held-local-packet-references',formatVersion:1,scope:'original-retained-local-packet-strings-at-every-held-metadata-point',occurrences,bodies:bodies.map(({key,kind,native})=>({key,kind,native})),requirements});
}
