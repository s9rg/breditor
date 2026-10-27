/** A new bounded complete intent; existing codecs and ceilings stay unchanged. */
import {fields as readFields,rows as readRows,integer as readInteger,hash as readHash} from '../physical_room_record_cut/policy.js';
import {database as readDatabase,identifier as readIdentifier} from '../physical_room_asset_adoption/policy.js';
export const MAX_ROOM_EXECUTION_BYTES=1024*1024*1024,MAX_ROOM_EXECUTION_HEADER_BYTES=16*1024*1024,MAX_ROOM_EXECUTION_MEMBERS=1024;
export const ROOM_EXECUTION_MAGIC='BREDITOR-NATIVE-ROOM-EXECUTION-1\n',ROOM_EXECUTION_MIME='application/x-breditor-native-room-execution';
export class RoomExecutionError extends Error {constructor(readonly code:'room_execution_policy'|'room_execution_integrity'|'room_execution_budget'|'room_execution_closed'|'room_execution_aborted'|'room_execution_exists'|'room_execution_missing'|'room_execution_storage'|'room_execution_busy'){super('Choose and retain every complete replacement input before retiring writers or opening targets');this.name='RoomExecutionError';}}
export const fail=(code:RoomExecutionError['code']='room_execution_integrity')=>new RoomExecutionError(code);
export function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]){try{return readFields(value,required,optional);}catch{throw fail('room_execution_policy');}}
export function rows(value:unknown,max:number){try{return readRows(value,max);}catch{throw fail('room_execution_policy');}}
export function integer(value:unknown,max:number,min=0){try{return readInteger(value,max,min);}catch{throw fail('room_execution_budget');}}
export function hash(value:unknown){try{return readHash(value);}catch{throw fail();}}
export function database(value:unknown){try{return readDatabase(value);}catch{throw fail('room_execution_policy');}}
export function identifier(value:unknown){try{return readIdentifier(value);}catch{throw fail('room_execution_policy');}}
export function immutable<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))immutable(child);Object.freeze(value);}return value;}
