/** Decode only the canonical bytes that match this manifest entry. */
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import type {RecordCutEntry} from './manifest.js';
import {parseRecordCutJson} from './json.js';
import {fail,MAX_ROOM_RECORD_CUT_JSON_BYTES} from './policy.js';

export async function readPinnedRecordCutJson(file:Blob,pin:RecordCutEntry,context:ArchiveIntegrityContext):Promise<unknown>{
 if(file.type!=='application/json'||file.size>MAX_ROOM_RECORD_CUT_JSON_BYTES)throw fail('record_cut_budget');
 if(file.size!==pin.bytes)throw fail('record_cut_integrity');
 const {bytes,sha256}=await context.readAndDigest(file,MAX_ROOM_RECORD_CUT_JSON_BYTES);
 if(bytes.byteLength!==pin.bytes||sha256!==pin.sha256)throw fail('record_cut_integrity');
 let text:string;
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw fail();}
 return parseRecordCutJson(text);
}
