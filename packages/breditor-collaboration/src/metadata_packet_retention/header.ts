/** Closed storage framing only. Native identity/source and complete server
 * coverage are separately checked against actual readers, never this header. */
import {fields,integer,rows,hash} from '../physical_room_record_cut/policy.js';
import {digest} from '../relay/validation.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SharedPacketAssetIdentity} from '../packet_asset_references.js';
import type {MetadataPacketArchiveHeader,MetadataPacketBody} from './contract.js';
import {MAX_METADATA_PACKET_BODIES,MAX_METADATA_PACKET_OCCURRENCES,MAX_METADATA_PACKET_CHUNK_BYTES} from './contract.js';
import {fail} from './policy.js';
function key(value:unknown):string{if(typeof value!=='string'||!/^(version|suggestion|revision):[a-f0-9]{64}$/.test(value))throw fail();return value;}
function label(value:unknown):string{if(typeof value!=='string'||!value||value.length>4096)throw fail();return value;}
export function metadataPacketHeader(input:unknown):MetadataPacketArchiveHeader{
 const r=fields(input,['format','formatVersion','scope','parent','catalog','bodies','server','local','chunks']);
 if(r['format']!=='breditor/original-metadata-packet-retention'||r['formatVersion']!==1||r['scope']!=='exact-first-server-and-original-local-metadata-packet-strings')throw fail();
 const parent=fields(r['parent'],['bytes','sha256']),chunks=rows(r['chunks'],MAX_METADATA_PACKET_BODIES).map(raw=>{const row=fields(raw,['bytes','sha256']);return{bytes:integer(row['bytes'],MAX_METADATA_PACKET_CHUNK_BYTES,1),sha256:hash(row['sha256'])};}),offsets=chunks.map(()=>0),seen=new Map<string,MetadataPacketBody>();let currentChunk=0;
 const bodies=rows(r['bodies'],MAX_METADATA_PACKET_BODIES).map(raw=>{
  const row=fields(raw,['key','kind','native','fingerprint','encoding','encodedBytes','encodedSha256','chunk','offset']),kind=row['kind'];if(kind!=='version'&&kind!=='suggestion'&&kind!=='revision')throw fail();
  const n=fields(row['native'],kind==='revision'?['kind','id','previousSuggestionId','suggestionId']:['kind','id']),id=digest(n['id']);let native:SharedPacketAssetIdentity;
  if(kind==='revision'){if(n['kind']!=='suggestion_revision')throw fail();const previousSuggestionId=digest(n['previousSuggestionId']),suggestionId=digest(n['suggestionId']);if(previousSuggestionId===suggestionId||id===previousSuggestionId||id===suggestionId)throw fail();native={kind:'suggestion_revision',id,previousSuggestionId,suggestionId};}
  else{if(n['kind']!==kind)throw fail();native={kind,id};}
  const p=fields(row['fingerprint'],['id','bytes','sha256']),fingerprint={id:digest(p['id']),bytes:integer(p['bytes'],4*1024*1024,1),sha256:digest(p['sha256'])},encodedSha256=hash(row['encodedSha256']),bodyKey=key(row['key']),chunk=integer(row['chunk'],chunks.length-1),offset=integer(row['offset'],MAX_METADATA_PACKET_CHUNK_BYTES),encodedBytes=integer(row['encodedBytes'],24*1024*1024+2,1);
  if(fingerprint.id!==id||row['encoding']!=='json-string-v1'||bodyKey!==kind+':'+encodedSha256||seen.has(bodyKey)||chunk<currentChunk||chunk>currentChunk+1||offset!==offsets[chunk]||offset+encodedBytes>chunks[chunk]!.bytes)throw fail();currentChunk=chunk;offsets[chunk]=offset+encodedBytes;
  const body:MetadataPacketBody={key:bodyKey,kind,native,fingerprint,encoding:'json-string-v1',encodedBytes,encodedSha256,chunk,offset};seen.set(bodyKey,body);return body;
 });
 if(offsets.some((value,index)=>value!==chunks[index]!.bytes)||!bodies.length&&chunks.length)throw fail();
 const used=new Set<string>(),serverIds=new Set<string>();
 const server=rows(r['server'],3071).map(raw=>{const row=fields(raw,['kind','id','body']),body=key(row['body']),record=seen.get(body),kind=row['kind'],id=digest(row['id']),identity=String(kind)+':'+id;if(!record||record.kind!==kind||record.native.id!==id||serverIds.has(identity))throw fail();serverIds.add(identity);used.add(body);return{kind:record.kind,id,body};});
 const occurrences=new Set<string>();
 const local=rows(r['local'],MAX_METADATA_PACKET_OCCURRENCES).map(raw=>{const row=fields(raw,['participant','point','store','index','body','previousBody']),participant=label(row['participant']),point=label(row['point']),store=row['store'],index=integer(row['index'],MAX_METADATA_PACKET_OCCURRENCES),body=key(row['body']),record=seen.get(body),previousBody=row['previousBody']===null?null:key(row['previousBody']);if(!record||store!=='versions'&&store!=='suggestions'&&store!=='revisions'||record.kind!==(store==='versions'?'version':store==='suggestions'?'suggestion':'revision'))throw fail();
  if(store==='revisions'){const parent=previousBody===null?undefined:seen.get(previousBody);if(!parent||parent.kind!=='suggestion'||record.native.kind!=='suggestion_revision'||parent.native.id!==record.native.previousSuggestionId)throw fail();used.add(previousBody!);}else if(previousBody!==null)throw fail();
  const identity=JSON.stringify([participant,point,store,index]);if(occurrences.has(identity))throw fail();occurrences.add(identity);used.add(body);return{participant,point,store:store as 'versions'|'suggestions'|'revisions',index,body,previousBody};});
 if(used.size!==bodies.length)throw fail();
 return frozen({format:'breditor/original-metadata-packet-retention',formatVersion:1,scope:'exact-first-server-and-original-local-metadata-packet-strings',parent:{bytes:integer(parent['bytes'],1024*1024*1024,1),sha256:hash(parent['sha256'])},catalog:r['catalog'] as MetadataPacketArchiveHeader['catalog'],bodies,server,local,chunks});
}
