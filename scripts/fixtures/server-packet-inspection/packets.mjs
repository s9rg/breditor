/** Test-only frame from actual original server reads and a genuine readonly
 * diagnostic core. This creates no client owner, writer grant or ACK. */
import assert from 'node:assert/strict';
import {prepareArchiveIntegrity} from '../../../packages/breditor-collaboration/dist/archive_integrity/context.js';
import {captureSelectedServerMetadata,withCheckedServerMetadataCatalog} from '../../../packages/breditor-collaboration/dist/server_metadata_read/collect.js';
import {generationRecoveryHostPort} from '../../../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {MetadataPacketBodyStore} from '../../../packages/breditor-collaboration/dist/metadata_packet_retention/body_store.js';
import {encodeMetadataPacketArchive} from '../../../packages/breditor-collaboration/dist/metadata_packet_retention/archive.js';
export async function captureServerOnlyPackets(reader,core,options){
 const check=()=>options.checkAuthority(),integrity=prepareArchiveIntegrity(options),port=generationRecoveryHostPort(reader),catalog=await captureSelectedServerMetadata(reader,{versions:{kind:'start'},suggestions:{kind:'start'},revisions:{kind:'start'}});
 return withCheckedServerMetadataCatalog(catalog,async index=>{
  const store=new MetadataPacketBodyStore(integrity,check),server=[],suggestions=new Map();
  for(const[kind,list]of [['version',index.fingerprints.versions],['suggestion',index.fingerprints.suggestions],['revision',index.fingerprints.revisions]])for(const expected of list){
   const result=await port.readMetadataPacket({kind,expected});let previous;
   if(kind==='revision'){const receipt=index.revisions.find(row=>row.revision.id===expected.id);assert.ok(receipt);previous=suggestions.get(receipt.revision.previousSuggestionId);assert.equal(typeof previous,'string');}
   const body=await store.retain(kind,result.packet.text,core,previous);assert.deepEqual(body.fingerprint,expected);if(kind==='suggestion')suggestions.set(expected.id,result.packet.text);server.push({kind,id:expected.id,body:body.key});
  }
  const chunks=await store.finish(),parent={bytes:2,sha256:await integrity.digest(new Blob(['{}']))};
  const header={format:'breditor/original-metadata-packet-retention',formatVersion:1,scope:'exact-first-server-and-original-local-metadata-packet-strings',parent,catalog,bodies:store.bodies(),server,local:[],chunks:chunks.map(({bytes,sha256})=>({bytes,sha256}))};
  return {files:await encodeMetadataPacketArchive(header,chunks,options),parent};
 });
}
