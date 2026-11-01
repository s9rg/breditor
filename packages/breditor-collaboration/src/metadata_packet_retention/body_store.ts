/** Native-validated immutable strings, deduplicated by their encoded bytes.
 * A Native ID or UTF-8 digest never collapses distinct original local strings. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import type {SharedPacketAssetIdentity} from '../packet_asset_references.js';
import type {OriginalMetadataPacketKind} from '../server_metadata_read/packet_contract.js';
import {MAX_SERVER_METADATA_PACKET_BYTES} from '../server_metadata_read/packet_contract.js';
import {receiptPacketReaders} from '../metadata_receipt_containment/native_packets.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {MAX_METADATA_PACKET_BODIES,MAX_METADATA_PACKET_CHUNK_BYTES,type MetadataPacketBody,type MetadataPacketFile} from './contract.js';
import {fail,same,textBytes} from './policy.js';
const read=Blob.prototype.text;
export class MetadataPacketBodyStore {
 readonly #integrity:ArchiveIntegrityContext;readonly #check:()=>void;
 readonly #bodies=new Map<string,MetadataPacketBody>();readonly #payloads=new Map<string,Blob>();
 readonly #chunks:MetadataPacketFile[]=[];#parts:Blob[]=[];#bytes=0;#finished=false;
 constructor(integrity:ArchiveIntegrityContext,check:()=>void){this.#integrity=integrity;this.#check=check;}
 async retain(kind:OriginalMetadataPacketKind,text:string,core:SharedRichEditor<SharedSelectionPolicy>,previous?:string):Promise<MetadataPacketBody>{
  this.#check();if(this.#finished||!['version','suggestion','revision'].includes(kind)||typeof text!=='string'||!text||textBytes(text)>MAX_SERVER_METADATA_PACKET_BYTES)throw fail('metadata_packet_retention_budget');
  const native=receiptPacketReaders(core);let identity:SharedPacketAssetIdentity;
  if(kind==='version')identity={kind:'version',id:native.version(text).id};
  else if(kind==='suggestion')identity={kind:'suggestion',id:native.suggestion(text).id};
  else{if(previous===undefined)throw fail();const info=native.revision(previous,text);identity={kind:'suggestion_revision',id:info.id,previousSuggestionId:info.previousSuggestionId,suggestionId:info.suggestion.id};}
  this.#check();const encoded=new Blob([JSON.stringify(text)],{type:'application/json'}),digest=await this.#integrity.digest(encoded);this.#check();
  const key=kind+':'+digest,known=this.#bodies.get(key);
  if(known){if(!same(known.native,identity)||await read.call(this.#payloads.get(key)!)!==JSON.stringify(text))throw fail();this.#check();return known;}
  if(this.#bodies.size>=MAX_METADATA_PACKET_BODIES||encoded.size>MAX_METADATA_PACKET_CHUNK_BYTES)throw fail('metadata_packet_retention_budget');
  if(this.#bytes+encoded.size>MAX_METADATA_PACKET_CHUNK_BYTES)await this.#flush();
  const raw=new Blob([text]),fingerprint={id:identity.id,bytes:raw.size,sha256:'sha256:'+await this.#integrity.digest(raw)};this.#check();
  const body=frozen({key,kind,native:identity,fingerprint,encoding:'json-string-v1' as const,encodedBytes:encoded.size,encodedSha256:digest,chunk:this.#chunks.length,offset:this.#bytes});
  this.#bodies.set(key,body);this.#payloads.set(key,encoded);this.#parts.push(encoded);this.#bytes+=encoded.size;return body;
 }
 bodies():readonly MetadataPacketBody[]{this.#check();return Object.freeze([...this.#bodies.values()]);}
 async text(key:string):Promise<string>{this.#check();const file=this.#payloads.get(key);if(!file)throw fail();const value=JSON.parse(await read.call(file));this.#check();if(typeof value!=='string')throw fail();return value;}
 async finish():Promise<readonly MetadataPacketFile[]>{this.#check();if(this.#finished)throw fail();await this.#flush();this.#check();this.#finished=true;return Object.freeze([...this.#chunks]);}
 async #flush():Promise<void>{if(!this.#parts.length)return;this.#check();const file=new Blob(this.#parts,{type:'application/octet-stream'}),sha256=await this.#integrity.digest(file);this.#check();this.#chunks.push(Object.freeze({file,bytes:file.size,sha256}));this.#parts=[];this.#bytes=0;}
}
