/** A separate bounded recovery family. No old schema, frame or storage limit
 * changes meaning and overflow never truncates retained native evidence. */
import {fields as dataFields,rows as dataRows,integer as dataInteger,hash as dataHash} from '../physical_room_record_cut/policy.js';
import {database as dataDatabase} from '../physical_room_asset_adoption/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
export const MAX_GENERATION_RECONSTRUCTION_BYTES=1024*1024*1024,MAX_GENERATION_RECONSTRUCTION_HEADER_BYTES=16*1024*1024;
export const GENERATION_RECONSTRUCTION_MAGIC='BREDITOR-GENERATION-ROOM-RECONSTRUCTION1\n',GENERATION_RECONSTRUCTION_MIME='application/vnd.breditor.generation-room-reconstruction';
export class GenerationReconstructionError extends Error{constructor(readonly code:'generation_reconstruction_policy'|'generation_reconstruction_integrity'|'generation_reconstruction_budget'|'generation_reconstruction_exists'|'generation_reconstruction_missing'|'generation_reconstruction_busy'|'generation_reconstruction_closed'|'generation_reconstruction_aborted'|'generation_reconstruction_storage'){super('Reconstruct complete generation-retained native work without replacing old data or granting activation');this.name='GenerationReconstructionError';}}
export const fail=(code:GenerationReconstructionError['code']='generation_reconstruction_integrity')=>new GenerationReconstructionError(code);
export function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{try{return dataFields(value,required,optional);}catch{throw fail('generation_reconstruction_policy');}}
export function rows(value:unknown,maximum:number):unknown[]{try{return dataRows(value,maximum);}catch{throw fail('generation_reconstruction_budget');}}
export function integer(value:unknown,maximum:number,minimum=0):number{try{return dataInteger(value,maximum,minimum);}catch{throw fail('generation_reconstruction_budget');}}
export function hash(value:unknown):string{try{return dataHash(value);}catch{throw fail();}}
export function database(value:unknown):string{try{return dataDatabase(value);}catch{throw fail('generation_reconstruction_policy');}}
export function mime(value:unknown):string{if(typeof value!=='string'||value.length>255||/[\u0000-\u001f\u007f]/u.test(value))throw fail();return value;}
export const immutable=frozen;
