/** Preserve literal server text. Never parse/restringify the packet as a replacement. */
import {archiveFields as fields} from '../archive_integrity/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {ServerMetadataFamily} from './contract.js';
import {MAX_SERVER_METADATA_PACKET_RESPONSE_BYTES,type OriginalMetadataPacket,type OriginalMetadataPacketQuery,type SelectedServerMetadataPacketRead} from './packet_contract.js';
import {metadataPacketQuery} from './packet_query.js';
import {fail} from './policy.js';
export function readMetadataPacketResponse<S>(text:string,family:ServerMetadataFamily,expected:S,sha256:string,query:OriginalMetadataPacketQuery,selectionReader:(input:unknown)=>S):SelectedServerMetadataPacketRead<S>{
 try{
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_SERVER_METADATA_PACKET_RESPONSE_BYTES||!/^[a-f0-9]{64}$/.test(sha256))throw fail();
  const r=fields(JSON.parse(text),'format,formatVersion,selection,requestSha256,scope,packet'),format=`breditor/${family}-metadata-packet-read` as const,scope='selected-server-original-accepted-metadata-packet-bytes';
  if(r['format']!==format||r['formatVersion']!==1||r['requestSha256']!==sha256||r['scope']!==scope)throw fail();
  const selection=selectionReader(r['selection']);if(JSON.stringify(selection)!==JSON.stringify(expected))throw fail();
  const p=fields(r['packet'],'kind,fingerprint,text'),selected=metadataPacketQuery({kind:p['kind'],expected:p['fingerprint']});
  if(JSON.stringify(selected)!==JSON.stringify(query)||typeof p['text']!=='string'||new TextEncoder().encode(p['text']).length!==selected.expected.bytes)throw fail();
  const packet:OriginalMetadataPacket={kind:selected.kind,fingerprint:selected.expected,text:p['text']};
  const result:SelectedServerMetadataPacketRead<S>={format,formatVersion:1,selection,requestSha256:sha256,scope,packet};
  if(JSON.stringify(result)!==text)throw fail();return frozen(result);
 }catch{throw fail('metadata_read_protocol');}
}
/** Run while the genuine host request reservation and cancellation guards hold. */
export async function verifyMetadataPacketBytes<S>(read:SelectedServerMetadataPacketRead<S>):Promise<void>{
 try{
  const bytes=new TextEncoder().encode(read.packet.text),digest=await crypto.subtle.digest('SHA-256',bytes),sha256='sha256:'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(bytes.length!==read.packet.fingerprint.bytes||sha256!==read.packet.fingerprint.sha256)throw fail();
 }catch{throw fail('metadata_read_protocol');}
}
