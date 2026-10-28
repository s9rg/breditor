/** New closed data family. Existing native frame, source and history limits
 * retain their meanings. A complete input never truncates to fit this bound. */
import {fields as ownFields,rows as ownRows,integer as ownInteger,hash as ownHash} from '../physical_room_record_cut/policy.js';
export const MAX_GENERATION_NATIVE_IMPORT_BYTES=1024*1024*1024,MAX_GENERATION_NATIVE_IMPORT_HEADER_BYTES=16*1024*1024,MAX_GENERATION_NATIVE_IMPORT_PAGES=4096;
export const GENERATION_NATIVE_IMPORT_MAGIC='BREDITOR-GENERATION-NATIVE-IMPORT-INPUT1\n',GENERATION_NATIVE_IMPORT_MIME='application/vnd.breditor.generation-native-import-input';
export class SelectedGenerationNativeImportError extends Error{constructor(readonly code:'generation_native_import_policy'|'generation_native_import_integrity'|'generation_native_import_budget'|'generation_native_import_closed'|'generation_native_import_aborted'|'generation_native_import_exists'|'generation_native_import_busy'|'generation_native_import_storage'){super('Retain the complete before-state and original accepted native input without granting edits or activation');this.name='SelectedGenerationNativeImportError';}}
export const fail=(code:SelectedGenerationNativeImportError['code']='generation_native_import_integrity')=>new SelectedGenerationNativeImportError(code);
export function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{try{return ownFields(value,required,optional);}catch{throw fail('generation_native_import_policy');}}
export function rows(value:unknown,maximum:number):unknown[]{try{return ownRows(value,maximum);}catch{throw fail('generation_native_import_policy');}}
export function integer(value:unknown,maximum:number,minimum=0):number{try{return ownInteger(value,maximum,minimum);}catch{throw fail('generation_native_import_budget');}}
export function hash(value:unknown):string{try{return ownHash(value);}catch{throw fail();}}
