/** Immutable retention intent only. No stage, ready, native ownership or activation marker. */
import {archiveFields} from "../archive_integrity/policy.js";
import {parsePhysicalCatalogManifest} from "./manifest.js";
import {physicalCatalogFailure} from "./policy.js";
export interface PhysicalCatalogRecord {readonly format:"breditor/shared-physical-room-recovery-state";readonly formatVersion:1;readonly manifest:string}
export function physicalCatalogRecord(manifest:string):PhysicalCatalogRecord {
 parsePhysicalCatalogManifest(manifest);return Object.freeze({format:"breditor/shared-physical-room-recovery-state",formatVersion:1,manifest});
}
export function checkPhysicalCatalogRecord(input:unknown,expected?:string):PhysicalCatalogRecord {
 try{const r=archiveFields(input,"format,formatVersion,manifest");if(r["format"]!=="breditor/shared-physical-room-recovery-state"||r["formatVersion"]!==1||typeof r["manifest"]!=="string"||expected!==undefined&&r["manifest"]!==expected)throw physicalCatalogFailure("catalog_diverged");return physicalCatalogRecord(r["manifest"]);}catch{throw physicalCatalogFailure("catalog_diverged");}
}
