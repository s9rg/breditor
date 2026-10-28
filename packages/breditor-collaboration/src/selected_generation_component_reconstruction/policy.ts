/** A separate bounded recovery family. No old schema, frame or storage limit
 * changes meaning and overflow never truncates retained native evidence. */
import {fields as dataFields,rows as dataRows,integer as dataInteger,hash as dataHash} from '../physical_room_record_cut/policy.js';
import {database as dataDatabase} from '../physical_room_asset_adoption/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
export const MAX_GENERATION_COMPONENT_RECONSTRUCTION_BYTES=1024*1024*1024,MAX_GENERATION_COMPONENT_RECONSTRUCTION_HEADER_BYTES=16*1024*1024;
export const GENERATION_COMPONENT_RECONSTRUCTION_MAGIC='BREDITOR-GENERATION-COMPONENT-RECONSTRUCTION1\n',GENERATION_COMPONENT_RECONSTRUCTION_MIME='application/vnd.breditor.generation-component-reconstruction';
export class GenerationComponentReconstructionError extends Error{constructor(readonly code:'generation_component_reconstruction_requires_merge'|'generation_component_reconstruction_policy'|'generation_component_reconstruction_integrity'|'generation_component_reconstruction_budget'|'generation_component_reconstruction_exists'|'generation_component_reconstruction_missing'|'generation_component_reconstruction_busy'|'generation_component_reconstruction_closed'|'generation_component_reconstruction_aborted'|'generation_component_reconstruction_storage'){super('Reconstruct complete generation-retained native work without replacing old data or granting activation');this.name='GenerationComponentReconstructionError';}}
export const fail=(code:GenerationComponentReconstructionError['code']='generation_component_reconstruction_integrity')=>new GenerationComponentReconstructionError(code);
export function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{try{return dataFields(value,required,optional);}catch{throw fail('generation_component_reconstruction_policy');}}
export function rows(value:unknown,maximum:number):unknown[]{try{return dataRows(value,maximum);}catch{throw fail('generation_component_reconstruction_budget');}}
export function integer(value:unknown,maximum:number,minimum=0):number{try{return dataInteger(value,maximum,minimum);}catch{throw fail('generation_component_reconstruction_budget');}}
export function hash(value:unknown):string{try{return dataHash(value);}catch{throw fail();}}
export function database(value:unknown):string{try{return dataDatabase(value);}catch{throw fail('generation_component_reconstruction_policy');}}
export function mime(value:unknown):string{if(typeof value!=='string'||value.length>255||/[\u0000-\u001f\u007f]/u.test(value))throw fail();return value;}
export const immutable=frozen;
