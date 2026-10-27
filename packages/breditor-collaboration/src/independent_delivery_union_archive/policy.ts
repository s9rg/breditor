/** Separate finite archive; existing native, packet, raster and room formats are unchanged. */
import{MAX_INDEPENDENT_DELIVERY_PARTICIPANT_BYTES}from'../independent_delivery_participant/codec.js';
import{MAX_ASSET_BACKUP_BYTES}from'@breditor/experimental-rich-content';
import{MAX_SHARED_ARCHIVE_DIGEST_BYTES}from'../archive_integrity/policy.js';
import{fields as dataFields,integer as dataInteger,hash as dataHash,rows as dataRows}from'../physical_room_record_cut/policy.js';
import{database as dataDatabase}from'../physical_room_asset_adoption/policy.js';
export const MAX_INDEPENDENT_DELIVERY_UNION_ARCHIVE_HEADER_BYTES=16*1024*1024;
/** Covers all three existing maximum participant files, a full three-sided asset base and framing. */
export const MAX_INDEPENDENT_DELIVERY_UNION_ARCHIVE_BYTES=3*MAX_INDEPENDENT_DELIVERY_PARTICIPANT_BYTES+4*MAX_ASSET_BACKUP_BYTES+MAX_INDEPENDENT_DELIVERY_UNION_ARCHIVE_HEADER_BYTES+4096;
export const MAX_UNION_COMPONENT_BYTES=MAX_SHARED_ARCHIVE_DIGEST_BYTES;
export const UNION_ARCHIVE_MAGIC='BREDITOR-INDEPENDENT-DELIVERY-UNION-1\n',UNION_ARCHIVE_MIME='application/vnd.breditor.independent-delivery-union';
export class SharedIndependentDeliveryUnionArchiveError extends Error{constructor(readonly code='delivery_union_integrity'){super('Retain both complete participant branches and the exact asset decision before replacement');this.name='SharedIndependentDeliveryUnionArchiveError';}}
export const fail=(code?:string)=>new SharedIndependentDeliveryUnionArchiveError(code);
export function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]){try{return dataFields(value,required,optional);}catch{throw fail('delivery_union_policy');}}
export function integer(value:unknown,maximum:number,minimum=0){try{return dataInteger(value,maximum,minimum);}catch{throw fail('delivery_union_budget');}}
export function hash(value:unknown){try{return dataHash(value);}catch{throw fail();}}
export function rows(value:unknown,maximum:number){try{return dataRows(value,maximum);}catch{throw fail('delivery_union_policy');}}
export function database(value:unknown){try{return dataDatabase(value);}catch{throw fail('delivery_union_policy');}}
