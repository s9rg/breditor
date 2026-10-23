/** Version-three immutable intent only. No native-ready, disposition or activation
 * flag is persisted; every reopen re-admits the actual declared file bytes. */
import {archiveFields} from '../archive_integrity/policy.js';
import {physicalCatalogFailure} from '../physical_room_catalog/policy.js';
import {parsePhysicalCatalogV3Manifest} from './manifest.js';
export interface PhysicalCatalogV3Record{readonly format:'breditor/shared-physical-room-recovery-state';readonly formatVersion:3;readonly manifest:string}
export function physicalCatalogV3Record(manifest:string):PhysicalCatalogV3Record{parsePhysicalCatalogV3Manifest(manifest);return Object.freeze({format:'breditor/shared-physical-room-recovery-state',formatVersion:3,manifest});}
export function checkPhysicalCatalogV3Record(input:unknown,expected?:string):PhysicalCatalogV3Record{
 try{const row=archiveFields(input,'format,formatVersion,manifest');if(row['format']!=='breditor/shared-physical-room-recovery-state'||row['formatVersion']!==3||typeof row['manifest']!=='string'||expected!==undefined&&row['manifest']!==expected)throw physicalCatalogFailure('catalog_diverged');return physicalCatalogV3Record(row['manifest']);}catch{throw physicalCatalogFailure('catalog_diverged');}
}
