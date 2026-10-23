/** Version three adds two explicit local families. Version one/two parsers and
 * limits keep their meanings; metadata integrity grants no operational custody. */
import {archiveFields} from '../archive_integrity/policy.js';
import {physicalCatalogMetadata} from '../physical_room_catalog/manifest.js';
import {physicalCatalogFailure,physicalCatalogKnown,MAX_PHYSICAL_ROOM_CATALOG_BYTES,MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES} from '../physical_room_catalog/policy.js';
import {freezeGeneration} from '../generation_source/identity.js';
import {physicalCatalogV2Rows} from '../physical_room_catalog_v2/input_snapshot.js';
import {physicalCatalogV3Participant} from './participant.js';
import type {PhysicalRoomCatalogV3Metadata} from './contract.js';
export function physicalCatalogV3Metadata(input:unknown):PhysicalRoomCatalogV3Metadata{
 try{
  const row=archiveFields(input,'format,formatVersion,catalog,origin,current,participants');
  if(row['format']!=='breditor/shared-physical-room-recovery-catalog'||row['formatVersion']!==3)throw physicalCatalogFailure('catalog_policy');
  const participants=physicalCatalogV2Rows(row['participants'] as readonly unknown[],physicalCatalogV3Participant);
  for(let index=1;index<participants.length;index++)if(participants[index-1]!.id>=participants[index]!.id)throw physicalCatalogFailure('catalog_policy');
  const base=physicalCatalogMetadata({format:row['format'],formatVersion:1,catalog:row['catalog'],origin:row['origin'],current:row['current'],participants:[]}),metadata=freezeGeneration({...base,formatVersion:3 as const,participants});
  if(metadata.origin.bytes+metadata.current.server.bytes+metadata.current.participants.bytes+participants.reduce((sum,row)=>sum+row.bytes,0)>MAX_PHYSICAL_ROOM_CATALOG_BYTES||new TextEncoder().encode(JSON.stringify(metadata)).length>MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES)throw physicalCatalogFailure('catalog_budget');return metadata;
 }catch(error){throw physicalCatalogKnown(error,'catalog_policy');}
}
export function parsePhysicalCatalogV3Manifest(input:unknown):PhysicalRoomCatalogV3Metadata{
 if(typeof input!=='string'||input.length>MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES||new TextEncoder().encode(input).length>MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES)throw physicalCatalogFailure('catalog_budget');
 try{const metadata=physicalCatalogV3Metadata(JSON.parse(input));if(JSON.stringify(metadata)!==input)throw physicalCatalogFailure('catalog_integrity');return metadata;}catch(error){throw physicalCatalogKnown(error);}
}
