/** Explicit version-two file table. Original server/native declarations keep
 * their closed readers; no declaration is native ancestry or activation proof. */
import {archiveFields} from '../archive_integrity/policy.js';
import {physicalCatalogMetadata} from '../physical_room_catalog/manifest.js';
import {physicalCatalogFailure,physicalCatalogKnown,MAX_PHYSICAL_ROOM_CATALOG_BYTES,MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES} from '../physical_room_catalog/policy.js';
import {freezeGeneration} from '../generation_source/identity.js';
import {physicalCatalogV2Rows} from './input_snapshot.js';
import {physicalCatalogV2Participant} from './participant.js';
import type {PhysicalRoomCatalogV2Metadata} from './contract.js';
export function physicalCatalogV2Metadata(input:unknown):PhysicalRoomCatalogV2Metadata{
 try{
  const row=archiveFields(input,'format,formatVersion,catalog,origin,current,participants');
  if(row['format']!=='breditor/shared-physical-room-recovery-catalog'||row['formatVersion']!==2)throw physicalCatalogFailure('catalog_policy');
  const participants=physicalCatalogV2Rows(row['participants'] as readonly unknown[],physicalCatalogV2Participant);
  for(let index=1;index<participants.length;index++)if(participants[index-1]!.id>=participants[index]!.id)throw physicalCatalogFailure('catalog_policy');
  const base=physicalCatalogMetadata({format:row['format'],formatVersion:1,catalog:row['catalog'],origin:row['origin'],current:row['current'],participants:[]});
  const metadata=freezeGeneration({...base,formatVersion:2 as const,participants});
  if(metadata.origin.bytes+metadata.current.server.bytes+metadata.current.participants.bytes+participants.reduce((sum,row)=>sum+row.bytes,0)>MAX_PHYSICAL_ROOM_CATALOG_BYTES||new TextEncoder().encode(JSON.stringify(metadata)).length>MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES)throw physicalCatalogFailure('catalog_budget');return metadata;
 }catch(error){throw physicalCatalogKnown(error,'catalog_policy');}
}
export function parsePhysicalCatalogV2Manifest(input:unknown):PhysicalRoomCatalogV2Metadata{
 if(typeof input!=='string'||input.length>MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES||new TextEncoder().encode(input).length>MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES)throw physicalCatalogFailure('catalog_budget');
 try{const metadata=physicalCatalogV2Metadata(JSON.parse(input));if(JSON.stringify(metadata)!==input)throw physicalCatalogFailure('catalog_integrity');return metadata;}catch(error){throw physicalCatalogKnown(error);}
}
