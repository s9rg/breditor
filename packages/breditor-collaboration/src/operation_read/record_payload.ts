/** Internal opt-in data projection from the SAME genuine live source read.
 * This registry is not source admission or transferable custody. Incoming APIs
 * must reserve actual parents themselves, never accept a registered DTO/handle.
 * Ordinary reference reads install no payload; disposal forgets all producers.
 */
import {SharedEditorError} from '../core.js';
export type OperationalRecordReadMode='records-v1';
export type RecordPayloadFamily='original'|'generation'|'independent-local'|'independent-delivery'|'restored-graph'|'local-operation-snapshot'|'local-operation-flat';
export interface SourceRecordPayload{readonly family:RecordPayloadFamily;readonly state:unknown;readonly files:readonly Readonly<{role:string;file:Blob}>[]}
interface Entry{readonly current:()=>void;readonly read:()=>SourceRecordPayload}
const entries=new WeakMap<object,Entry>(),fail=()=>new SharedEditorError('record_payload_closed','Use the opt-in payload of the same genuine held source read');
export function recordReadMode(value:OperationalRecordReadMode|undefined):void{if(value!==undefined&&value!=='records-v1')throw fail();}
/** Trusted capture implementation only. A callback must return detached data,
 * literal immutable input files, and no source, permission or release operation. */
export function retainSourceRecordPayload(owner:object,current:()=>void,read:()=>SourceRecordPayload):void{if(entries.has(owner))throw fail();entries.set(owner,{current,read});}
export function forgetSourceRecordPayload(owner:object):void{entries.delete(owner);}
export function sourceHasRecordPayload(owner:object):boolean{return entries.has(owner);}
export function sourceRecordPayload(owner:object):SourceRecordPayload{
 const entry=entries.get(owner);if(!entry)throw fail();entry.current();const value=entry.read(),state=structuredClone(value.state),files=value.files.map(row=>Object.freeze({role:row.role,file:new Blob([row.file],{type:row.file.type})}));entry.current();return Object.freeze({family:value.family,state,files:Object.freeze(files)});
}
/** Forward only an already installed SDK producer. No extra read or full-data
 * allocation happens until the full-record consumer explicitly requests it. */
export function forwardSourceRecordPayload(owner:object,source:object,current:()=>void,wrap?:(source:SourceRecordPayload)=>SourceRecordPayload):void{
 if(sourceHasRecordPayload(source))retainSourceRecordPayload(owner,current,()=>{const value=sourceRecordPayload(source);return wrap?wrap(value):value;});
}
