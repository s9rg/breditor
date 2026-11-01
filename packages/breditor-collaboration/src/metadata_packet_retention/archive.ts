/** Portable immutable byte admission. This class proves no Native identity,
 * server completeness, current permission, journal ACK or activation right. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {recordCutBytes} from '../physical_room_record_cut/framing.js';
import {fields,hash,integer,rows} from '../physical_room_record_cut/policy.js';
import {MAX_METADATA_PACKET_CHUNK_BYTES,MAX_METADATA_PACKET_MANIFEST_BYTES,MAX_METADATA_PACKET_BODIES,type MetadataPacketArchiveFiles,type MetadataPacketArchiveHeader,type MetadataPacketBodyRead,type MetadataPacketFile} from './contract.js';
import {metadataPacketHeader} from './header.js';
import {admitRecordedMetadataCatalog} from './catalog_data.js';
import {generationControlSelection} from '../generation_recovery_control/identity.js';
import {checkMetadataPacketCoverage} from './coverage.js';
import {fail,same,textBytes} from './policy.js';
const token=Object.freeze({}),slice=Blob.prototype.slice;
function file(input:unknown,maximum:number):MetadataPacketFile{const r=fields(input,['file','bytes','sha256']),bytes=integer(r['bytes'],maximum,1),sha256=hash(r['sha256']),file=archiveBlob(r['file'] as Blob,maximum);if(file.size!==bytes)throw fail();return Object.freeze({file,bytes,sha256});}
export function packetArchiveFiles(input:unknown):MetadataPacketArchiveFiles{const r=fields(input,['manifest','chunks']);return Object.freeze({manifest:file(r['manifest'],MAX_METADATA_PACKET_MANIFEST_BYTES),chunks:Object.freeze(rows(r['chunks'],MAX_METADATA_PACKET_BODIES).map(value=>file(value,MAX_METADATA_PACKET_CHUNK_BYTES)))});}
export class MetadataPacketArchive {
 #state:Readonly<{header:MetadataPacketArchiveHeader;bodies:ReadonlyMap<string,MetadataPacketArchiveHeader['bodies'][number]>;files:MetadataPacketArchiveFiles;options:SharedArchiveIntegrityOptions}>|undefined;
 private constructor(key:object,header:MetadataPacketArchiveHeader,files:MetadataPacketArchiveFiles,options:SharedArchiveIntegrityOptions){if(key!==token)throw fail();this.#state={header,bodies:new Map(header.bodies.map(row=>[row.key,row])),files,options};Object.freeze(this);}
 header():MetadataPacketArchiveHeader{return this.#open().header;}
 files():MetadataPacketArchiveFiles{return this.#open().files;}
 #open(){if(!this.#state)throw fail('metadata_packet_retention_closed');return this.#state;}
 async body(key:string):Promise<MetadataPacketBodyRead>{
  const state=this.#open(),files=state.files,row=state.bodies.get(key);if(!row)throw fail();const integrity=prepareArchiveIntegrity(state.options);integrity.guard();
  const part=slice.call(files.chunks[row.chunk]!.file,row.offset,row.offset+row.encodedBytes);if(await integrity.digest(part)!==row.encodedSha256)throw fail();
  const data=await recordCutBytes(part,0,part.size,integrity);let encoded:string;try{encoded=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data);}catch{throw fail();}
  let text:unknown;try{text=JSON.parse(encoded);}catch{throw fail();}if(typeof text!=='string'||JSON.stringify(text)!==encoded||textBytes(text)!==row.fingerprint.bytes||'sha256:'+await integrity.digest(new Blob([text]))!==row.fingerprint.sha256)throw fail();
  if(this.#open()!==state)throw fail('metadata_packet_retention_closed');integrity.guard();return Object.freeze({kind:row.kind,fingerprint:row.fingerprint,text,storageKey:row.key,native:row.native});
 }
 dispose():void{this.#state=undefined;}
 static async read(provided:MetadataPacketArchiveFiles,expectedParent:Readonly<{bytes:number;sha256:string}>,options:SharedArchiveIntegrityOptions):Promise<MetadataPacketArchive>{
  const files=packetArchiveFiles(provided),parent=fields(expectedParent,['bytes','sha256']),integrity=prepareArchiveIntegrity(options);integrity.guard();
  if(await integrity.digest(files.manifest.file)!==files.manifest.sha256)throw fail();const bytes=await recordCutBytes(files.manifest.file,0,files.manifest.bytes,integrity);let text:string;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw fail();}
  const header=metadataPacketHeader(JSON.parse(text));if(JSON.stringify(header)!==text||!same(header.parent,{bytes:integer(parent['bytes'],1024*1024*1024,1),sha256:hash(parent['sha256'])})||!same(header.chunks,files.chunks.map(({bytes,sha256})=>({bytes,sha256}))))throw fail();
  const selection=generationControlSelection(header.catalog.selection),index=await admitRecordedMetadataCatalog(header.catalog,selection,selection.source.server.native.source.document,integrity.guard);checkMetadataPacketCoverage(header,index);
  for(const chunk of files.chunks){integrity.guard();if(await integrity.digest(chunk.file)!==chunk.sha256)throw fail();}
  let archive:MetadataPacketArchive|undefined;try{archive=new MetadataPacketArchive(token,header,files,Object.freeze({wasm:integrity.wasm,checkAuthority:integrity.guard}));for(const body of header.bodies)await archive.body(body.key);integrity.guard();return archive;}catch(error){archive?.dispose();throw error;}
 }
}
/** Round-trip the exact storage reader before publishing new immutable files. */
export async function encodeMetadataPacketArchive(header:MetadataPacketArchiveHeader,chunks:readonly MetadataPacketFile[],options:SharedArchiveIntegrityOptions):Promise<MetadataPacketArchiveFiles>{
 const integrity=prepareArchiveIntegrity(options);integrity.guard();const normalized=metadataPacketHeader(header),text=JSON.stringify(normalized),file=new Blob([text],{type:'application/vnd.breditor.metadata-packet-retention+json'});if(file.size>MAX_METADATA_PACKET_MANIFEST_BYTES)throw fail('metadata_packet_retention_budget');
 const files=Object.freeze({manifest:Object.freeze({file,bytes:file.size,sha256:await integrity.digest(file)}),chunks:Object.freeze([...chunks])});integrity.guard();const read=await MetadataPacketArchive.read(files,header.parent,options);read.dispose();integrity.guard();return files;
}
