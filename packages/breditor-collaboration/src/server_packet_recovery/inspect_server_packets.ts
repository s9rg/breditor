/** Compare recorded complete original receipts and every exact first-server
 * packet with a fresh genuine host read. This does not authenticate local
 * occurrences, copied Native identities, client histories or recorded rights. */
import {MetadataPacketArchive} from '../metadata_packet_retention/archive.js';
import {admitRecordedMetadataCatalog} from '../metadata_packet_retention/catalog_data.js';
import {captureSelectedServerMetadata,withCheckedServerMetadataCatalog} from '../server_metadata_read/collect.js';
import {SharedServerLogGenerationRecoveryHost,generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
const header=MetadataPacketArchive.prototype.header,body=MetadataPacketArchive.prototype.body;
export async function inspectOriginalServerPacketCatalog(archive:MetadataPacketArchive,host:SharedServerLogGenerationRecoveryHost,signal:AbortSignal|undefined,check:()=>void):Promise<Readonly<{pages:number;serverBodies:number}>>{
 check();const recorded=header.call(archive),port=generationRecoveryHostPort(host),selection=port.selection;
 if(!same(recorded.catalog.selection.source.server,selection.source.server)||!same(recorded.catalog.selection.source.participants,selection.source.participants)||!same(selection.source.origin,selection.source.server))throw fail();
 const index=await admitRecordedMetadataCatalog(recorded.catalog,recorded.catalog.selection,selection.source.server.native.source.document,check);check();
 const fresh=await captureSelectedServerMetadata(host,{versions:{kind:'start'},suggestions:{kind:'start'},revisions:{kind:'start'}},signal);check();
 const result=await withCheckedServerMetadataCatalog(fresh,async current=>{
  if(!same(current,index)||!same(fresh.terminal,recorded.catalog.terminal)||!same(fresh.pages.map(row=>row.metadata),recorded.catalog.pages.map(row=>row.metadata)))throw fail();
  for(const occurrence of recorded.server){
   check();const original=await body.call(archive,occurrence.body);check();
   const result=await port.readMetadataPacket({kind:occurrence.kind,expected:original.fingerprint},signal);check();
   if(!same(result.selection,selection)||result.packet.kind!==original.kind||!same(result.packet.fingerprint,original.fingerprint)||result.packet.text!==original.text)throw fail();
  }
  if(header.call(archive)!==recorded)throw fail();check();return Object.freeze({pages:fresh.pages.length,serverBodies:recorded.server.length});
 });check();return result;
}
