/** Closed immutable resolution DATA. A digest admits bytes, never a source,
 * cache state or Native owner. Inspection recomputes every field independently. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {fields,integer,hash} from '../physical_room_record_cut/policy.js';
import {recordCutBytes} from '../physical_room_record_cut/framing.js';
import type {MetadataPacketFile} from '../metadata_packet_retention/contract.js';
import type {ServerPacketSourceResolution} from './contract.js';
import {fail} from '../metadata_packet_retention/policy.js';
export const MAX_SERVER_PACKET_SOURCE_RESOLUTION_BYTES=64*1024*1024;
export function sourceResolutionFile(input:unknown):MetadataPacketFile{
 const r=fields(input,['file','bytes','sha256']),file=archiveBlob(r['file'] as Blob,MAX_SERVER_PACKET_SOURCE_RESOLUTION_BYTES),bytes=integer(r['bytes'],MAX_SERVER_PACKET_SOURCE_RESOLUTION_BYTES,1),sha256=hash(r['sha256']);if(file.size!==bytes)throw fail();return Object.freeze({file,bytes,sha256});
}
export async function encodeSourceResolution(value:ServerPacketSourceResolution,options:SharedArchiveIntegrityOptions):Promise<MetadataPacketFile>{
 const integrity=prepareArchiveIntegrity(options);integrity.guard();const file=new Blob([JSON.stringify(value)],{type:'application/vnd.breditor.server-packet-source-resolution+json'});if(file.size>MAX_SERVER_PACKET_SOURCE_RESOLUTION_BYTES)throw fail('metadata_packet_retention_budget');const result=Object.freeze({file,bytes:file.size,sha256:await integrity.digest(file)});integrity.guard();return result;
}
export async function inspectSourceResolution(provided:MetadataPacketFile,expected:ServerPacketSourceResolution,options:SharedArchiveIntegrityOptions):Promise<void>{
 const selected=sourceResolutionFile(provided),integrity=prepareArchiveIntegrity(options);integrity.guard();if(await integrity.digest(selected.file)!==selected.sha256)throw fail();const bytes=await recordCutBytes(selected.file,0,selected.bytes,integrity);let text:string;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw fail();}if(text!==JSON.stringify(expected))throw fail();integrity.guard();
}
