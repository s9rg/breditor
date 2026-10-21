/** Separate physical catalog errors and fixed envelope policy; original catalog contracts are unchanged. */
import {SharedArchiveIntegrityError} from "../archive_integrity/policy.js";
export const MAX_PHYSICAL_ROOM_CATALOG_FILES=4096;
export const MAX_PHYSICAL_ROOM_CATALOG_BYTES=16*1024*1024*1024;
export const MAX_PHYSICAL_ROOM_CATALOG_METADATA_BYTES=16*1024*1024;
export class SharedPhysicalRoomRecoveryCatalogError extends Error {
 constructor(readonly code:"catalog_policy"|"catalog_budget"|"catalog_integrity"|"catalog_closed"|"catalog_missing"|"catalog_exists"|"catalog_diverged"|"catalog_storage"|"catalog_in_use"|"catalog_source",message:string){super(message);this.name="SharedPhysicalRoomRecoveryCatalogError";}
}
export function physicalCatalogFailure(code:SharedPhysicalRoomRecoveryCatalogError["code"]="catalog_storage"):SharedPhysicalRoomRecoveryCatalogError{return new SharedPhysicalRoomRecoveryCatalogError(code,{
 catalog_policy:"Select a complete explicit physical room catalog and independent source identities",
 catalog_budget:"Declared physical room files exceed the fixed catalog envelope",
 catalog_integrity:"Declared physical room files differ from their independent selections",
 catalog_closed:"The physical room catalog is closed or was not admitted by this SDK",
 catalog_missing:"A selected physical room catalog or declared file is absent",
 catalog_exists:"A physical room catalog never overwrites an occupied database",
 catalog_diverged:"Stored physical room files differ from the selected immutable catalog",
 catalog_storage:"Physical room catalog storage did not complete",
 catalog_in_use:"The physical catalog or its storage reservation is already held",
 catalog_source:"Selected genuine client histories do not match this physical room catalog"
}[code]);}
export function physicalCatalogKnown(error:unknown,fallback:SharedPhysicalRoomRecoveryCatalogError["code"]="catalog_integrity"):Error{if(error instanceof SharedPhysicalRoomRecoveryCatalogError||error instanceof SharedArchiveIntegrityError)return error;try{if(error&&typeof error==="object"&&"code"in error&&["recovery_in_use","writer_in_use","review_writer_in_use"].includes(String(error.code)))return physicalCatalogFailure("catalog_in_use");}catch{}return physicalCatalogFailure(fallback);}
export function physicalCatalogName(value:unknown):string{if(typeof value!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value))throw physicalCatalogFailure("catalog_policy");return value;}
export function physicalCatalogDatabase(value:unknown):string{if(typeof value!=="string"||!value||value.length>200)throw physicalCatalogFailure("catalog_policy");return value;}
export function physicalCatalogSelection(value:unknown):Readonly<import("./contract.js").SharedPhysicalRoomRecoveryCatalogSelection>{if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==2||!Object.hasOwn(value,"catalog")||!Object.hasOwn(value,"sha256"))throw physicalCatalogFailure("catalog_policy");const r=value as Record<string,unknown>;if(typeof r["sha256"]!=="string"||!/^[a-f0-9]{64}$/.test(r["sha256"]))throw physicalCatalogFailure("catalog_policy");return Object.freeze({catalog:physicalCatalogName(r["catalog"]),sha256:r["sha256"]});}
export const physicalParticipantKey=(id:string):string=>"participant:"+physicalCatalogName(id);
