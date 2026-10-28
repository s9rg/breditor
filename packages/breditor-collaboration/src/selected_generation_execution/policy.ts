/** Separate bounded execution journal. Old native/source/frame limits and
 * protocol meanings are unchanged; no progress or history is truncated. */
import {fields as dataFields,rows as dataRows,integer as dataInteger,hash as dataHash} from '../physical_room_record_cut/policy.js';
import {database as dataDatabase,identifier as dataIdentifier} from '../physical_room_asset_adoption/policy.js';
export const MAX_GENERATION_NATIVE_EXECUTION_BYTES=1024*1024*1024,MAX_GENERATION_NATIVE_EXECUTION_EVENTS=4096,MAX_GENERATION_NATIVE_EXECUTION_EVIDENCE_BYTES=16*1024*1024;
export class GenerationNativeExecutionError extends Error{constructor(readonly code:'generation_native_execution_policy'|'generation_native_execution_integrity'|'generation_native_execution_budget'|'generation_native_execution_exists'|'generation_native_execution_busy'|'generation_native_execution_closed'|'generation_native_execution_aborted'|'generation_native_execution_storage'){super('Retain actual native execution progress without losing source history or granting activation');this.name='GenerationNativeExecutionError';}}
export const fail=(code:GenerationNativeExecutionError['code']='generation_native_execution_integrity')=>new GenerationNativeExecutionError(code);
export function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{try{return dataFields(value,required,optional);}catch{throw fail('generation_native_execution_policy');}}
export function rows(value:unknown,maximum:number):unknown[]{try{return dataRows(value,maximum);}catch{throw fail('generation_native_execution_policy');}}
export function integer(value:unknown,maximum:number,minimum=0):number{try{return dataInteger(value,maximum,minimum);}catch{throw fail('generation_native_execution_budget');}}
export function hash(value:unknown):string{try{return dataHash(value);}catch{throw fail();}}
export function database(value:unknown):string{try{return dataDatabase(value);}catch{throw fail('generation_native_execution_policy');}}
export function identifier(value:unknown):string{try{return dataIdentifier(value);}catch{throw fail('generation_native_execution_policy');}}
