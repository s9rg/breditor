/** New closed data family. Existing native frame, source and history limits
 * retain their meanings. A complete input never truncates to fit this bound. */
import {fields as ownFields,rows as ownRows,integer as ownInteger,hash as ownHash} from '../physical_room_record_cut/policy.js';
export const MAX_NATIVE_IMPORT_BYTES=1024*1024*1024,MAX_NATIVE_IMPORT_HEADER_BYTES=16*1024*1024,MAX_NATIVE_IMPORT_PAGES=4096;
export const NATIVE_IMPORT_MAGIC='BREDITOR-NATIVE-IMPORT-INPUT1\n',NATIVE_IMPORT_MIME='application/vnd.breditor.native-import-input';
export class SelectedNativeImportError extends Error{constructor(readonly code:'native_import_policy'|'native_import_integrity'|'native_import_budget'|'native_import_closed'|'native_import_aborted'|'native_import_exists'|'native_import_busy'|'native_import_storage'){super('Retain the complete before-state and original accepted native input without granting edits or activation');this.name='SelectedNativeImportError';}}
export const fail=(code:SelectedNativeImportError['code']='native_import_integrity')=>new SelectedNativeImportError(code);
export function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{try{return ownFields(value,required,optional);}catch{throw fail('native_import_policy');}}
export function rows(value:unknown,maximum:number):unknown[]{try{return ownRows(value,maximum);}catch{throw fail('native_import_policy');}}
export function integer(value:unknown,maximum:number,minimum=0):number{try{return ownInteger(value,maximum,minimum);}catch{throw fail('native_import_budget');}}
export function hash(value:unknown):string{try{return ownHash(value);}catch{throw fail();}}
