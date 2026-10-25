/** Separate bounded execution journal. Old native/source/frame limits and
 * protocol meanings are unchanged; no progress or history is truncated. */
import {fields as dataFields,rows as dataRows,integer as dataInteger,hash as dataHash} from '../physical_room_record_cut/policy.js';
import {database as dataDatabase,identifier as dataIdentifier} from '../physical_room_asset_adoption/policy.js';
export const MAX_NATIVE_EXECUTION_BYTES=1024*1024*1024,MAX_NATIVE_EXECUTION_EVENTS=4096,MAX_NATIVE_EXECUTION_EVIDENCE_BYTES=16*1024*1024;
export class NativeExecutionError extends Error{constructor(readonly code:'native_execution_policy'|'native_execution_integrity'|'native_execution_budget'|'native_execution_exists'|'native_execution_busy'|'native_execution_closed'|'native_execution_aborted'|'native_execution_storage'){super('Retain actual native execution progress without losing source history or granting activation');this.name='NativeExecutionError';}}
export const fail=(code:NativeExecutionError['code']='native_execution_integrity')=>new NativeExecutionError(code);
export function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{try{return dataFields(value,required,optional);}catch{throw fail('native_execution_policy');}}
export function rows(value:unknown,maximum:number):unknown[]{try{return dataRows(value,maximum);}catch{throw fail('native_execution_policy');}}
export function integer(value:unknown,maximum:number,minimum=0):number{try{return dataInteger(value,maximum,minimum);}catch{throw fail('native_execution_budget');}}
export function hash(value:unknown):string{try{return dataHash(value);}catch{throw fail();}}
export function database(value:unknown):string{try{return dataDatabase(value);}catch{throw fail('native_execution_policy');}}
export function identifier(value:unknown):string{try{return dataIdentifier(value);}catch{throw fail('native_execution_policy');}}
