/** New closed aggregation family. Old room, native, packet and upload limits stay unchanged. */
import{fields as f,rows as r,integer as i,hash as h}from'../physical_room_record_cut/policy.js';
import{database as d,identifier as id}from'../physical_room_asset_adoption/policy.js';
import{MAX_SHARED_ARCHIVE_DIGEST_BYTES}from'../archive_integrity/policy.js';
export const MAX_NATIVE_ROOM_UNION_BYTES=16*1024*1024*1024,MAX_NATIVE_ROOM_UNION_HEADER_BYTES=16*1024*1024,MAX_NATIVE_ROOM_UNION_PARTICIPANTS=1024,MAX_NATIVE_ROOM_UNION_COMPONENT_BYTES=MAX_SHARED_ARCHIVE_DIGEST_BYTES;
export const NATIVE_ROOM_UNION_MAGIC='BREDITOR-NATIVE-ROOM-UNION-1\n',NATIVE_ROOM_UNION_MIME='application/vnd.breditor.native-room-union';
export class NativeRoomUnionError extends Error{constructor(readonly code='room_union_integrity'){super('Bind every participant proof to both complete held room inputs before replacement');this.name='NativeRoomUnionError';}}
export const fail=(code?:string)=>new NativeRoomUnionError(code);
export function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]){try{return f(value,required,optional);}catch{throw fail('room_union_policy');}}
export function rows(value:unknown,max:number){try{return r(value,max);}catch{throw fail('room_union_policy');}}
export function integer(value:unknown,max:number,min=0){try{return i(value,max,min);}catch{throw fail('room_union_budget');}}
export function hash(value:unknown){try{return h(value);}catch{throw fail();}}
export function database(value:unknown){try{return d(value);}catch{throw fail('room_union_policy');}}
export function identifier(value:unknown){try{return id(value);}catch{throw fail('room_union_policy');}}
