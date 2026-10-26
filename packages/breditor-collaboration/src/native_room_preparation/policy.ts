/** Separate finite preparation budget: no old protocol is widened or clipped. */
import {fields as dataFields,rows as dataRows,integer as dataInteger,hash as dataHash} from '../physical_room_record_cut/policy.js';
import {database as dataDatabase,identifier as dataIdentifier} from '../physical_room_asset_adoption/policy.js';
export const MAX_ROOM_PREPARATION_BYTES=1024*1024*1024,MAX_ROOM_PREPARATION_HEADER_BYTES=16*1024*1024,MAX_ROOM_PREPARATION_PARTICIPANTS=1024;
export const ROOM_PREPARATION_MAGIC='BREDITOR-NATIVE-ROOM-PREPARATION-1\n',ROOM_PREPARATION_MIME='application/x-breditor-native-room-preparation';
export class RoomPreparationError extends Error{constructor(readonly code:'room_preparation_policy'|'room_preparation_integrity'|'room_preparation_budget'|'room_preparation_exists'|'room_preparation_missing'|'room_preparation_busy'|'room_preparation_storage'|'room_preparation_closed'|'room_preparation_aborted'){super('Retain every complete reconstruction input before replacing any room participant');this.name='RoomPreparationError';}}
export const fail=(code:RoomPreparationError['code']='room_preparation_integrity')=>new RoomPreparationError(code);
export function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]){try{return dataFields(value,required,optional);}catch{throw fail('room_preparation_policy');}}
export function rows(value:unknown,maximum:number){try{return dataRows(value,maximum);}catch{throw fail('room_preparation_policy');}}
export function integer(value:unknown,maximum:number,minimum=0){try{return dataInteger(value,maximum,minimum);}catch{throw fail('room_preparation_budget');}}
export function hash(value:unknown){try{return dataHash(value);}catch{throw fail();}}
export function database(value:unknown){try{return dataDatabase(value);}catch{throw fail('room_preparation_policy');}}
export function identifier(value:unknown){try{return dataIdentifier(value);}catch{throw fail('room_preparation_policy');}}
export function mime(value:unknown):string{if(typeof value!=='string'||value.length>256||/[^\x20-\x7e]/.test(value)||value!==value.toLowerCase())throw fail('room_preparation_policy');return value;}
/** Freeze only a previously admitted JSON-only detached tree. */
export function immutable<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))immutable(child);Object.freeze(value);}return value;}
