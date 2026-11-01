/** One genuine catalog/source capture. First server bodies and every literal
 * local occurrence stay distinct. No cache is imported and no retry is changed. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {RetainedDeliveryClient} from '../complete_operation_cohort/retained_native_read.js';
import type {LocalMetadataDeliverySnapshot} from '../selected_local_metadata_delivery/contract.js';
import type {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import type {PreparedLocalMetadataReconciliation} from '../selected_local_metadata_assets/reconciliation_input.js';
import type {LocalMetadataReceiptContainmentRead} from '../metadata_receipt_containment/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {generationDeliveryRecoveryHostPort} from '../generation_delivery_control/host.js';
import {withCheckedServerMetadataCatalog} from '../server_metadata_read/collect.js';
import {visitHeldMetadataRecordPoints} from '../metadata_receipt_containment/visit.js';
import {receiptPacketReaders} from '../metadata_receipt_containment/native_packets.js';
import {sameInfo} from '../versions/validation.js';
import {suggestionInfo} from '../suggestions/validation.js';
import {revisionInfo} from '../suggestion_revisions/transport.js';
import {MetadataPacketBodyStore} from './body_store.js';
import {encodeMetadataPacketArchive} from './archive.js';
import {checkMetadataPacketCoverage} from './coverage.js';
import {readRetainedMetadataPacketReferences} from './native_references.js';
import {MAX_METADATA_PACKET_OCCURRENCES,type MetadataPacketLocalOccurrence,type MetadataPacketServerOccurrence,type MetadataPacketTextCapture,type MetadataPacketArchiveHeader} from './contract.js';
import {fail,same} from './policy.js';
export async function captureOriginalMetadataPacketTexts(scope:SelectedNativeRecoveryScope,sources:readonly RetainedDeliveryClient[],snapshot:LocalMetadataDeliverySnapshot,cut:PhysicalRoomRecordCutArchive,factories:readonly{id:string;read:unknown}[],input:PreparedLocalMetadataReconciliation,containment:LocalMetadataReceiptContainmentRead,parent:Readonly<{bytes:number;sha256:string}>,options:SharedArchiveIntegrityOptions,check:()=>void):Promise<MetadataPacketTextCapture>{
 check();input.check();const port=generationDeliveryRecoveryHostPort(input.host);if(!same(port.selection.current,containment.catalog.selection)||!sources.length)throw fail();
 return withCheckedServerMetadataCatalog(containment.catalog,async index=>{
  const integrity=prepareArchiveIntegrity({...options,checkAuthority:check}),store=new MetadataPacketBodyStore(integrity,check),local:MetadataPacketLocalOccurrence[]=[],server:MetadataPacketServerOccurrence[]=[],parents=new Map<string,string>();
  const add=(row:MetadataPacketLocalOccurrence)=>{if(local.length>=MAX_METADATA_PACKET_OCCURRENCES)throw fail('metadata_packet_retention_budget');local.push(row);};
  await visitHeldMetadataRecordPoints(sources,snapshot,cut,factories,scope.signal,check,async(row,point,records)=>{
   for(const[i,packet]of(records.versions?.packets??[]).entries()){const body=await store.retain('version',packet.packet,row.source.core);add({participant:row.id,point,store:'versions',index:i,body:body.key,previousBody:null});check();}
   for(const[i,packet]of(records.suggestions?.retained??[]).entries()){const body=await store.retain('suggestion',packet.packet,row.source.core);add({participant:row.id,point,store:'suggestions',index:i,body:body.key,previousBody:null});check();}
   for(const[i,packet]of(records.revisions?.retained??[]).entries()){const previous=await store.retain('suggestion',packet.previousPacket,row.source.core),body=await store.retain('revision',packet.packet,row.source.core,packet.previousPacket);parents.set(body.key,previous.key);add({participant:row.id,point,store:'revisions',index:i,body:body.key,previousBody:previous.key});check();}
  });
  const core=sources[0]!.source.core,native=receiptPacketReaders(core),suggestions=new Map<string,string>();
  for(const[kind,list]of [['version',index.fingerprints.versions],['suggestion',index.fingerprints.suggestions],['revision',index.fingerprints.revisions]] as const)for(const expected of list){
   check();input.check();const received=await port.readMetadataPacket({kind,expected},scope.signal);check();input.check();if(!same(received.selection,containment.catalog.selection)||received.packet.kind!==kind||!same(received.packet.fingerprint,expected))throw fail();const text=received.packet.text;
   const receipt=kind==='revision'?index.revisions.find(row=>row.revision.id===expected.id):undefined,parentKey=receipt?suggestions.get(receipt.revision.previousSuggestionId):undefined,previous=parentKey===undefined?undefined:await store.text(parentKey);
   const body=await store.retain(kind,text,core,previous);check();if(!same(body.fingerprint,expected))throw fail();
   if(kind==='version'){const info=index.versions.find(row=>row.version.id===expected.id)?.version;if(!info||!sameInfo(native.version(text),info))throw fail();}
   else if(kind==='suggestion'){const info=index.publications.find(row=>row.suggestion.id===expected.id)?.suggestion;if(!info||!same(suggestionInfo(native.suggestion(text)),info))throw fail();suggestions.set(expected.id,body.key);}
   else{if(!receipt||previous===undefined||!same(revisionInfo(native.revision(previous,text)),receipt.revision))throw fail();parents.set(body.key,parentKey!);}
   server.push({kind,id:expected.id,body:body.key});
  }
  const requirements=await readRetainedMetadataPacketReferences(sources.map(row=>({participant:row.id,core:row.source.core,check:()=>row.source.check()})),store,parents,check),chunks=await store.finish();check();
  const header:MetadataPacketArchiveHeader={format:'breditor/original-metadata-packet-retention',formatVersion:1,scope:'exact-first-server-and-original-local-metadata-packet-strings',parent,catalog:containment.catalog,bodies:store.bodies(),server,local,chunks:chunks.map(({bytes,sha256})=>({bytes,sha256}))};checkMetadataPacketCoverage(header,index);
  const files=await encodeMetadataPacketArchive(header,chunks,options);check();input.check();return Object.freeze({files,requirements});
 });
}
