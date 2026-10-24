/** New bounded data family. No existing journal, native or component ceiling is
 * widened. Refuse an oversized complete cut instead of silently truncating it. */
import {MAX_SHARED_ARCHIVE_DIGEST_BYTES} from '../archive_integrity/policy.js';
export const MAX_ROOM_RECORD_CUT_BYTES=MAX_SHARED_ARCHIVE_DIGEST_BYTES;
export const MAX_ROOM_RECORD_CUT_HEADER_BYTES=16*1024*1024;
export const MAX_ROOM_RECORD_CUT_JSON_BYTES=256*1024*1024;
export const MAX_ROOM_RECORD_CUT_ENTRIES=16384;
export const MAX_ROOM_RECORD_CUT_PARTICIPANTS=1024;
export class PhysicalRoomRecordCutError extends Error{
 constructor(readonly code:'record_cut_policy'|'record_cut_budget'|'record_cut_integrity'|'record_cut_source'|'record_cut_closed'|'record_cut_aborted'|'record_cut_storage'|'record_cut_exists'|'record_cut_missing'|'record_cut_busy'){super('Retain a complete independently selected room cut without granting source ownership or activation');this.name='PhysicalRoomRecordCutError';}
}
export const fail=(code:PhysicalRoomRecordCutError['code']='record_cut_policy')=>new PhysicalRoomRecordCutError(code);
export function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail();const keys=Reflect.ownKeys(value),result:Record<string,unknown>=Object.create(null) as Record<string,unknown>;
 if(required.some(key=>!Object.hasOwn(value,key))||keys.some(key=>typeof key!=='string'||!required.includes(key)&&!optional.includes(key)))throw fail();
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!d?.enumerable||!('value'in d))throw fail();Object.defineProperty(result,key,{value:d.value,enumerable:true});}return result;
}
export function integer(value:unknown,maximum:number,minimum=0):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||Object.is(value,-0)||value<minimum||value>maximum)throw fail('record_cut_budget');return value;}
export function hash(value:unknown):string{if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw fail();return value;}
export function text(value:unknown,maximum=4096):string{if(typeof value!=='string'||!value||new TextEncoder().encode(value).length>maximum||/[\u0000-\u001f\u007f]/u.test(value))throw fail();return value;}
export function rows(value:unknown,maximum:number):unknown[]{if(!Array.isArray(value)||value.length>maximum)throw fail('record_cut_budget');const result=[];for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!('value'in d))throw fail();result.push(d.value);}if(Reflect.ownKeys(value).length!==value.length+1)throw fail();return result;}
