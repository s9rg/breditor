/** Closed provenance for each complete component; labels alone prove nothing. */
import {identifier} from '../selected_native_reconstruction/policy.js';
import {MAX_ROOM_PREPARATION_PARTICIPANTS} from '../native_room_preparation/policy.js';
import {fields,rows,immutable,fail} from './policy.js';
export type GenerationComponentSide='current'|'journal';
export interface GenerationComponentRow {
 readonly id:string;
 readonly native:GenerationComponentSide;
 readonly originalUploads:GenerationComponentSide;
 readonly selectedUploads:GenerationComponentSide;
}
function side(value:unknown):GenerationComponentSide {
 if(value!=='current'&&value!=='journal')throw fail('generation_component_reconstruction_policy');
 return value;
}
export function generationComponents(value:unknown):readonly GenerationComponentRow[] {
 const seen=new Set<string>();
 const result=rows(value,MAX_ROOM_PREPARATION_PARTICIPANTS).map(value=>{
  const r=fields(value,['id','native','originalUploads','selectedUploads']),id=identifier(r['id']);
  if(seen.has(id))throw fail('generation_component_reconstruction_policy');seen.add(id);
  return {id,native:side(r['native']),originalUploads:side(r['originalUploads']),selectedUploads:side(r['selectedUploads'])};
 });
 if(!result.length)throw fail('generation_component_reconstruction_policy');return immutable(result);
}
