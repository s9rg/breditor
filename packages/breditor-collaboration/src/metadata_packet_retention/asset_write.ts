/** Both packet asset formats retain their own header and reader contracts. */
import {checkRichAssetLimits,type AssetLimits} from '@breditor/experimental-rich-content';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {fields} from '../physical_room_record_cut/policy.js';
import type {LocalMetadataRasterInfo} from '../selected_local_metadata_assets/materialization_contract.js';
import {metadataData} from '../selected_local_metadata_delivery/data.js';
import {MAX_METADATA_PACKET_ASSET_MANIFEST_BYTES,MAX_METADATA_PACKET_CHUNK_BYTES,type MetadataPacketAssetFiles,type MetadataPacketFile} from './contract.js';
import {fail,packetIntegrityOptions} from './policy.js';

interface PacketAssetFormat<Parent>{
 readonly mime:string;
 readonly header:(input:unknown,limits:Readonly<AssetLimits>,check:()=>void)=>Promise<{readonly parent:Parent}>;
 readonly read:(files:MetadataPacketAssetFiles,parent:Parent,options:SharedArchiveIntegrityOptions,limits:Readonly<AssetLimits>)=>Promise<{dispose():void}>;
}
const slice=Blob.prototype.slice;

function captureAssetData(input:unknown){
 const {provider,...header}=fields(input,['format','formatVersion','scope','parent','control','requirements','local','provider']);
 const receipt=fields(provider,['format','formatVersion','selection','requestSha256','scope','resolutions','assets','missing']);
 // Validate and copy each bounded collection independently of other collections.
 return {
  ...Object.fromEntries(Object.entries(header).map(([key,value])=>[key,metadataData(value)])),
  provider:Object.fromEntries(Object.entries(receipt).map(([key,value])=>[key,metadataData(value)])),
 };
}

export async function encodePacketAssetArchive<Parent>(
 input:unknown,
 payloads:readonly Readonly<{info:LocalMetadataRasterInfo;blob:Blob}>[],
 options:SharedArchiveIntegrityOptions,
 providedLimits:Partial<AssetLimits>,
 format:PacketAssetFormat<Parent>,
):Promise<MetadataPacketAssetFiles>{
 const selectedOptions=packetIntegrityOptions(options),limits=checkRichAssetLimits(providedLimits);
 const selected=captureAssetData(input),parts:Blob[]=[];
 if(payloads.length>100000)throw fail('metadata_packet_retention_budget');
 let offset=0;
 const entries=payloads.map(({info,blob})=>{
  const entry={...info,offset},file=archiveBlob(blob,limits.maxFileBytes);
  if(file.size!==entry.bytes)throw fail();
  offset+=file.size;
  if(offset>limits.maxStoredBytes||offset>1024*1024*1024)throw fail('metadata_packet_retention_budget');
  parts.push(file);
  return entry;
 });
 const body=new Blob(parts),integrity=prepareArchiveIntegrity(selectedOptions);
 const chunks:MetadataPacketFile[]=[];
 for(let start=0;start<body.size;start+=MAX_METADATA_PACKET_CHUNK_BYTES){
  const file=slice.call(body,start,start+MAX_METADATA_PACKET_CHUNK_BYTES),sha256=await integrity.digest(file);
  chunks.push(Object.freeze({file,bytes:file.size,sha256}));
 }
 const header=await format.header({...selected,payloads:entries,chunks:chunks.map(({bytes,sha256})=>({bytes,sha256}))},limits,integrity.guard);
 const file=new Blob([JSON.stringify(header)],{type:format.mime});
 if(file.size>MAX_METADATA_PACKET_ASSET_MANIFEST_BYTES)throw fail('metadata_packet_retention_budget');
 const files=Object.freeze({manifest:Object.freeze({file,bytes:file.size,sha256:await integrity.digest(file)}),chunks:Object.freeze(chunks)});
 const {signal}=selectedOptions;
 const admitted=await format.read(files,header.parent,{wasm:integrity.wasm,checkAuthority:integrity.guard,...(signal?{signal}:{})},limits);
 admitted.dispose();
 integrity.guard();
 return files;
}
