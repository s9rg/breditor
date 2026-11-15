/** A small manifest independently pins both original file selections and exact byte ranges. */
import {archiveBlob} from '../archive_integrity/policy.js';
import {MAX_INDEPENDENT_DELIVERY_PARTICIPANT_BYTES,INDEPENDENT_DELIVERY_PARTICIPANT_MIME} from '../independent_delivery_participant/codec.js';
import {independentDeliveryParticipantSelection} from '../independent_delivery_participant/policy.js';
import {parseRecordCutJson,recordCutJson} from '../physical_room_record_cut/json.js';
import {fields,hash,integer} from '../physical_room_record_cut/policy.js';
import type {SharedIndependentDeliveryBranchArchiveSelection,SharedIndependentDeliveryBranchComparison,SharedIndependentDeliveryBranchFile} from './contract.js';
import type {BranchArchiveScope} from './scope.js';

const magic=new TextEncoder().encode('BREDITOR-INDEPENDENT-DELIVERY-BRANCHES-1\n');
const prefixBytes=magic.length+4;
const headerMax=1024*1024;
const archiveMax=prefixBytes+headerMax+2*MAX_INDEPENDENT_DELIVERY_PARTICIPANT_BYTES;
const format='breditor/independent-delivery-branch-archive';
const mime='application/vnd.breditor.independent-delivery-branch-archive';

export function branchFile(input:unknown):SharedIndependentDeliveryBranchFile{
 const row=fields(input,['selection','file']);
 return Object.freeze({
  selection:independentDeliveryParticipantSelection(JSON.parse(recordCutJson(row['selection'],headerMax))),
  file:archiveBlob(row['file'] as Blob,MAX_INDEPENDENT_DELIVERY_PARTICIPANT_BYTES),
 });
}

function pin({selection,file}:SharedIndependentDeliveryBranchFile){
 return {selection,bytes:file.size};
}

export function branchManifest(
 current:SharedIndependentDeliveryBranchFile,
 incoming:SharedIndependentDeliveryBranchFile,
 comparison:SharedIndependentDeliveryBranchComparison,
):string{
 return recordCutJson({format,formatVersion:1,current:pin(current),incoming:pin(incoming),comparison},headerMax);
}

export async function encodeBranches(
 current:SharedIndependentDeliveryBranchFile,
 incoming:SharedIndependentDeliveryBranchFile,
 comparison:SharedIndependentDeliveryBranchComparison,
 scope:BranchArchiveScope,
){
 const header=new TextEncoder().encode(branchManifest(current,incoming,comparison));
 const prefix=new Uint8Array(prefixBytes);
 prefix.set(magic);
 new DataView(prefix.buffer).setUint32(magic.length,header.length,true);
 const file=new Blob([prefix,header,current.file,incoming.file],{type:mime});
 const manifestSha256=await scope.integrity.digest(new Blob([header]));
 return {file,selection:Object.freeze({bytes:file.size,manifestSha256})};
}

export function branchSelection(input:unknown):SharedIndependentDeliveryBranchArchiveSelection{
 const row=fields(input,['bytes','manifestSha256']);
 return Object.freeze({bytes:integer(row['bytes'],archiveMax,prefixBytes+2),manifestSha256:hash(row['manifestSha256'])});
}

export async function frameBranches(input:Blob,selection:SharedIndependentDeliveryBranchArchiveSelection,scope:BranchArchiveScope){
 const file=archiveBlob(input,archiveMax);
 if(file.size!==selection.bytes)throw new Error('Branch archive extent differs');
 const prefix=await scope.integrity.read(file,0,prefixBytes);
 if(magic.some((byte,index)=>prefix[index]!==byte))throw new Error('Invalid branch archive format');
 const length=new DataView(prefix.buffer,prefix.byteOffset,prefix.byteLength).getUint32(magic.length,true);
 integer(length,headerMax,2);
 if(prefixBytes+length>file.size)throw new Error('Incomplete branch archive manifest');
 const encoded=await scope.integrity.read(file,prefixBytes,length);
 if(await scope.integrity.digest(new Blob([encoded]))!==selection.manifestSha256){
  throw new Error('Branch archive manifest digest differs');
 }
 const header=new TextDecoder('utf-8',{fatal:true}).decode(encoded);
 const manifest=fields(parseRecordCutJson(header,headerMax),['format','formatVersion','current','incoming','comparison']);
 if(manifest['format']!==format||manifest['formatVersion']!==1)throw new Error('Unsupported branch archive format');
 let offset=prefixBytes+length;
 function take(name:'current'|'incoming'){
  const component=fields(manifest[name],['selection','bytes']);
  const bytes=integer(component['bytes'],MAX_INDEPENDENT_DELIVERY_PARTICIPANT_BYTES,1);
  if(bytes>file.size-offset)throw new Error('Incomplete branch archive component');
  const part=Blob.prototype.slice.call(file,offset,offset+bytes,INDEPENDENT_DELIVERY_PARTICIPANT_MIME);
  offset+=bytes;
  return branchFile({selection:component['selection'],file:part});
 }
 const current=take('current'),incoming=take('incoming');
 if(offset!==file.size)throw new Error('Unexpected data after branch archive');
 return {file:new Blob([file],{type:mime}),header,current,incoming};
}
