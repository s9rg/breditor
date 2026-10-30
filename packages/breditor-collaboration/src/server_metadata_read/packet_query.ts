/** Detach closed own data descriptors before authority, token callbacks or I/O. */
import {archiveFields} from '../archive_integrity/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {MAX_SERVER_METADATA_PACKET_BYTES,type OriginalMetadataPacketQuery} from './packet_contract.js';
import {fail} from './policy.js';
function data(input:unknown,names:string):Record<string,unknown>{
 const record=archiveFields(input,names),result:Record<string,unknown>={};
 for(const name of names.split(',')){const field=Object.getOwnPropertyDescriptor(record,name);if(!field||!('value'in field))throw fail('metadata_read_policy');result[name]=field.value;}
 return result;
}
export function metadataPacketQuery(input:unknown):OriginalMetadataPacketQuery {
 try{
  const r=data(input,'kind,expected'),p=data(r['expected'],'id,bytes,sha256'),kind=r['kind'],id=p['id'],bytes=p['bytes'],sha256=p['sha256'];
  if(!['version','suggestion','revision'].includes(kind as string)||typeof id!=='string'||!/^sha256:[a-f0-9]{64}$/.test(id)||typeof sha256!=='string'||!/^sha256:[a-f0-9]{64}$/.test(sha256)||typeof bytes!=='number'||!Number.isSafeInteger(bytes)||bytes<1||bytes>MAX_SERVER_METADATA_PACKET_BYTES)throw fail('metadata_read_policy');
  return frozen({kind:kind as OriginalMetadataPacketQuery['kind'],expected:{id,bytes,sha256}});
 }catch{throw fail('metadata_read_policy');}
}
