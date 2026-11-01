import type {ServerPacketAssetHeader} from './contract.js';
/** New raster scope; original materialized V1/V2 readers remain unchanged.
 * Data admission decodes every image and never revives provider permission. */
import {checkRichAssetLimits,inspectRichRaster,type AssetLimits} from '@breditor/experimental-rich-content';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {fields,integer,hash,rows} from '../physical_room_record_cut/policy.js';
import {recordCutBytes} from '../physical_room_record_cut/framing.js';
import type {LocalMetadataRasterInfo} from '../selected_local_metadata_assets/materialization_contract.js';
import {serverPacketAssetHeader} from './asset_header.js';
import {MAX_METADATA_PACKET_CHUNK_BYTES,type MetadataPacketAssetFiles,type MetadataPacketFile} from '../metadata_packet_retention/contract.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
const token=Object.freeze({}),slice=Blob.prototype.slice,maximum=1024*1024*1024,headerMaximum=16*1024*1024;
function selected(input:unknown,max:number):MetadataPacketFile{const r=fields(input,['file','bytes','sha256']),bytes=integer(r['bytes'],max,1),sha256=hash(r['sha256']),file=archiveBlob(r['file'] as Blob,max);if(file.size!==bytes)throw fail();return Object.freeze({file,bytes,sha256});}
export function packetAssetFiles(input:unknown):MetadataPacketAssetFiles{const r=fields(input,['manifest','chunks']);return Object.freeze({manifest:selected(r['manifest'],headerMaximum),chunks:Object.freeze(rows(r['chunks'],1024).map(row=>selected(row,MAX_METADATA_PACKET_CHUNK_BYTES)))});}
function range(chunks:readonly MetadataPacketFile[],offset:number,bytes:number,mime:string):Blob{const parts:Blob[]=[];let position=0,remaining=bytes;
 for(const row of chunks){if(remaining===0)break;if(position+row.bytes<=offset){position+=row.bytes;continue;}const start=Math.max(0,offset-position),count=Math.min(remaining,row.bytes-start);parts.push(slice.call(row.file,start,start+count));remaining-=count;offset+=count;position+=row.bytes;}
 if(remaining)throw fail();return new Blob(parts,{type:mime});
}
export class ServerPacketAssetArchive {
 #state:Readonly<{header:ServerPacketAssetHeader;files:MetadataPacketAssetFiles;payloads:ReadonlyMap<string,Blob>}>|undefined;
 private constructor(key:object,header:ServerPacketAssetHeader,files:MetadataPacketAssetFiles,payloads:ReadonlyMap<string,Blob>){if(key!==token)throw fail();this.#state={header,files,payloads};Object.freeze(this);}
 #open(){if(!this.#state)throw fail('metadata_packet_retention_closed');return this.#state;}
 header(){return this.#open().header;}
 payload(asset:string):Blob|undefined{return this.#open().payloads.get(asset);}
 files(){return this.#open().files;}
 dispose():void{this.#state=undefined;}
 static async read(provided:MetadataPacketAssetFiles,expectedParent:ServerPacketAssetHeader['parent'],options:SharedArchiveIntegrityOptions,providedLimits:Partial<AssetLimits>={}):Promise<ServerPacketAssetArchive>{
  const files=packetAssetFiles(provided),integrity=prepareArchiveIntegrity(options),limits=checkRichAssetLimits(providedLimits);integrity.guard();if(await integrity.digest(files.manifest.file)!==files.manifest.sha256)throw fail();const encoded=await recordCutBytes(files.manifest.file,0,files.manifest.bytes,integrity);let text:string;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(encoded);}catch{throw fail();}
  const header=await serverPacketAssetHeader(JSON.parse(text),limits,integrity.guard);if(JSON.stringify(header)!==text||!same(header.parent,expectedParent)||!same(header.chunks,files.chunks.map(({bytes,sha256})=>({bytes,sha256}))))throw fail();
  for(const row of files.chunks){integrity.guard();if(await integrity.digest(row.file)!==row.sha256)throw fail();}
  const payloads=new Map<string,Blob>();for(const row of header.payloads){integrity.guard();const raster=await inspectRichRaster(range(files.chunks,row.offset,row.bytes,row.mime),{limits,...(options.signal?{signal:options.signal}:{})});integrity.guard();if(raster.asset!==row.asset||raster.mime!==row.mime||raster.bytes!==row.bytes||raster.width!==row.width||raster.height!==row.height)throw fail();payloads.set(row.asset,raster.blob);}
  integrity.guard();return new ServerPacketAssetArchive(token,header,files,payloads);
 }
}
export async function encodeServerPacketAssets(input:Omit<ServerPacketAssetHeader,'payloads'|'chunks'>,payloads:readonly Readonly<{info:LocalMetadataRasterInfo;blob:Blob}>[],options:SharedArchiveIntegrityOptions,providedLimits:Partial<AssetLimits>={}):Promise<MetadataPacketAssetFiles>{
 const integrity=prepareArchiveIntegrity(options),limits=checkRichAssetLimits(providedLimits);integrity.guard();const body=new Blob(payloads.map(row=>archiveBlob(row.blob,limits.maxFileBytes)));if(body.size>limits.maxStoredBytes||body.size>maximum)throw fail('metadata_packet_retention_budget');
 const chunks:MetadataPacketFile[]=[];for(let offset=0;offset<body.size;offset+=MAX_METADATA_PACKET_CHUNK_BYTES){const file=slice.call(body,offset,offset+MAX_METADATA_PACKET_CHUNK_BYTES),sha256=await integrity.digest(file);integrity.guard();chunks.push(Object.freeze({file,bytes:file.size,sha256}));}
 let offset=0;const header=await serverPacketAssetHeader({...input,payloads:payloads.map(({info})=>{const row={...info,offset};offset+=info.bytes;return row;}),chunks:chunks.map(({bytes,sha256})=>({bytes,sha256}))},limits,integrity.guard),file=new Blob([JSON.stringify(header)],{type:'application/vnd.breditor.server-native-packet-assets+json'});if(file.size>headerMaximum)throw fail('metadata_packet_retention_budget');
 const files=Object.freeze({manifest:Object.freeze({file,bytes:file.size,sha256:await integrity.digest(file)}),chunks:Object.freeze(chunks)});integrity.guard();const read=await ServerPacketAssetArchive.read(files,header.parent,options,limits);read.dispose();integrity.guard();return files;
}
