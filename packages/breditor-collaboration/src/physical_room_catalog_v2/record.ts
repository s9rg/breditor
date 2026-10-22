/** Version-two immutable intent only. No native-ready, disposition or activation
 * flag is persisted; every reopen re-admits the actual declared file bytes. */
import {archiveFields} from '../archive_integrity/policy.js';
import {physicalCatalogFailure} from '../physical_room_catalog/policy.js';
import {parsePhysicalCatalogV2Manifest} from './manifest.js';
export interface PhysicalCatalogV2Record{readonly format:'breditor/shared-physical-room-recovery-state';readonly formatVersion:2;readonly manifest:string}
export function physicalCatalogV2Record(manifest:string):PhysicalCatalogV2Record{parsePhysicalCatalogV2Manifest(manifest);return Object.freeze({format:'breditor/shared-physical-room-recovery-state',formatVersion:2,manifest});}
export function checkPhysicalCatalogV2Record(input:unknown,expected?:string):PhysicalCatalogV2Record{
 try{const row=archiveFields(input,'format,formatVersion,manifest');if(row['format']!=='breditor/shared-physical-room-recovery-state'||row['formatVersion']!==2||typeof row['manifest']!=='string'||expected!==undefined&&row['manifest']!==expected)throw physicalCatalogFailure('catalog_diverged');return physicalCatalogV2Record(row['manifest']);}catch{throw physicalCatalogFailure('catalog_diverged');}
}
