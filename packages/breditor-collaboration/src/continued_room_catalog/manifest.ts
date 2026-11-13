import {archiveFields,archiveInteger} from '../archive_integrity/policy.js';
import {MAX_CONTINUED_PARTICIPANT_BYTES} from '../continued_participant/archive.js';
import {continuedParticipantSelection} from '../continued_participant/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {physicalCatalogV2Rows} from '../physical_room_catalog_v2/input_snapshot.js';
import {physicalCatalogMetadata} from '../physical_room_catalog/manifest.js';
import {MAX_PHYSICAL_ROOM_CATALOG_BYTES,MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES,physicalCatalogFailure,physicalCatalogName} from '../physical_room_catalog/policy.js';
import {physicalCatalogV3Participant,physicalCatalogV3ParticipantHeader,physicalCatalogV3ParticipantMaximum} from '../physical_room_catalog_v3/participant.js';
import type {ContinuedRoomCatalogEntry,ContinuedRoomCatalogLocalEntry,ContinuedRoomCatalogMetadata} from './contract.js';

type EntryHeader<T> = T extends ContinuedRoomCatalogEntry ? Omit<T,'bytes'> : never;
export function continuedRoomParticipantHeader(id:unknown,family:unknown,selection:unknown):EntryHeader<ContinuedRoomCatalogEntry>{
 if(family==='continued-local')return {id:physicalCatalogName(id),family,selection:continuedParticipantSelection(selection)};
 return physicalCatalogV3ParticipantHeader({id,family,selection});
}
export const continuedRoomParticipantMaximum=(family:ContinuedRoomCatalogEntry['family'])=>
 family==='continued-local'?MAX_CONTINUED_PARTICIPANT_BYTES:physicalCatalogV3ParticipantMaximum(family);
export function isContinuedRoomLocalEntry(entry:ContinuedRoomCatalogEntry):entry is ContinuedRoomCatalogLocalEntry{
 return entry.family==='continued-local';
}
export function continuedRoomMetadata(input:unknown):ContinuedRoomCatalogMetadata{
 const row=archiveFields(input,'format,formatVersion,catalog,origin,current,participants');
 if(row['format']!=='breditor/shared-physical-room-recovery-catalog'||row['formatVersion']!==4)throw physicalCatalogFailure('catalog_policy');
 const base=physicalCatalogMetadata({...row,formatVersion:1,participants:[]});
 const participants=physicalCatalogV2Rows(row['participants'] as readonly unknown[],value=>{
  const entry=archiveFields(value,'id,family,selection,bytes'),id=physicalCatalogName(entry['id']);
  if(entry['family']!=='continued-local')return physicalCatalogV3Participant(value);
  const selection=continuedParticipantSelection(entry['selection']);
  if(selection.identity.source.native.room!==base.current.server.identity.native.source.document)
   throw physicalCatalogFailure('catalog_source');
  return {id,family:'continued-local' as const,selection,bytes:archiveInteger(entry['bytes'],1,MAX_CONTINUED_PARTICIPANT_BYTES)};
 });
 if(!participants.some(isContinuedRoomLocalEntry)||participants.some((entry,index)=>index>0&&participants[index-1]!.id>=entry.id))throw physicalCatalogFailure('catalog_policy');
 const metadata={...base,formatVersion:4 as const,participants};
 if(base.origin.bytes+base.current.server.bytes+base.current.participants.bytes+
    participants.reduce((total,row:ContinuedRoomCatalogEntry)=>total+row.bytes,0)>MAX_PHYSICAL_ROOM_CATALOG_BYTES||
    new TextEncoder().encode(JSON.stringify(metadata)).length>MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES)
  throw physicalCatalogFailure('catalog_budget');
 return frozen(metadata);
}
export function parseContinuedRoomManifest(text:string):ContinuedRoomCatalogMetadata{
 if(typeof text!=='string'||text.length>MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES||
    new TextEncoder().encode(text).length>MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES)throw physicalCatalogFailure('catalog_budget');
 let parsed:unknown;
 try{parsed=JSON.parse(text);}catch{throw physicalCatalogFailure('catalog_integrity');}
 const metadata=continuedRoomMetadata(parsed);
 if(JSON.stringify(metadata)!==text)throw physicalCatalogFailure('catalog_integrity');
 return metadata;
}
