/** Independent insert-only intent/origin storage. Publication is an exact one-way CAS. */
import {existingDatabase} from "../participant_recovery/journal.js";
import {generationFields} from "../generation_source/identity.js";
import {generationRecoveryName} from "../generation_participant/prepare_recovery.js";
import {generationOperationFailure as fail} from "./policy.js";
export interface GenerationOperationRecord{readonly format:"breditor/shared-generation-participant-operation";readonly formatVersion:1;readonly recoveryDatabase:string;readonly plan:string;readonly phase:"prepared"|"operational"}
const operations="generation_operation",origins="generation_origin",stateKey="state",originKey="participant";
export function checkGenerationOperationRecord(input:unknown,expected?:GenerationOperationRecord):GenerationOperationRecord{
 if(!generationFields(input,"format,formatVersion,recoveryDatabase,plan,phase"))throw fail("generation_operation_diverged");const r=input as unknown as GenerationOperationRecord;generationRecoveryName(r.recoveryDatabase);
 if(r.format!=="breditor/shared-generation-participant-operation"||r.formatVersion!==1||typeof r.plan!=="string"||new TextEncoder().encode(r.plan).length>128*1024||!["prepared","operational"].includes(r.phase)||expected&&(r.recoveryDatabase!==expected.recoveryDatabase||r.plan!==expected.plan))throw fail("generation_operation_diverged");return {format:r.format,formatVersion:1,recoveryDatabase:r.recoveryDatabase,plan:r.plan,phase:r.phase};
}
export const generationOperationRecord=(recoveryDatabase:string,plan:string)=>checkGenerationOperationRecord({format:"breditor/shared-generation-participant-operation",formatVersion:1,recoveryDatabase,plan,phase:"prepared"});
function schema(db:IDBDatabase):void{if(db.version!==1||db.objectStoreNames.length!==2||![operations,origins].every(s=>db.objectStoreNames.contains(s)))throw fail("generation_operation_diverged");}
function store(s:IDBObjectStore):void{if(s.keyPath!==null||s.autoIncrement||s.indexNames.length)throw fail("generation_operation_diverged");}
export function createGenerationOperationDatabase(name:string,record:GenerationOperationRecord,file:Blob,guard:()=>void):Promise<IDBDatabase>{
 guard();return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);let created=false,blocked=false,reason:unknown;r.onupgradeneeded=e=>{try{guard();if(e.oldVersion!==0)throw fail("generation_operation_diverged");created=true;r.result.createObjectStore(operations).add(record,stateKey);r.result.createObjectStore(origins).add(file,originKey);}catch(error){reason=error;r.transaction!.abort();}};r.onerror=()=>reject(reason??fail());r.onblocked=()=>{blocked=true;reject(fail("generation_operation_diverged"));};r.onsuccess=()=>{try{guard();if(!created||blocked)throw fail("generation_operation_diverged");resolve(r.result);}catch(error){r.result.close();reject(error);}};});
}
export async function existingGenerationOperationDatabase(name:string):Promise<IDBDatabase>{const db=await existingDatabase(name);if(!db)throw fail("generation_operation_missing");try{schema(db);return db;}catch(e){db.close();throw e;}}
export function readGenerationOperationDatabase(db:IDBDatabase,expected?:GenerationOperationRecord):Promise<{record:GenerationOperationRecord;file:Blob}>{
 schema(db);return new Promise((resolve,reject)=>{const tx=db.transaction([operations,origins],"readonly");let record:GenerationOperationRecord,file:Blob,reason:unknown;const abort=(e:unknown)=>{reason=e;try{tx.abort();}catch{}};tx.oncomplete=()=>resolve({record,file});tx.onabort=()=>reject(reason??fail());
  const s=tx.objectStore(operations),o=tx.objectStore(origins);try{store(s);store(o);}catch(e){abort(e);return;}s.get(stateKey).onsuccess=e=>{try{record=checkGenerationOperationRecord((e.target as IDBRequest).result,expected);}catch(error){abort(error);}};o.get(originKey).onsuccess=e=>{const value=(e.target as IDBRequest).result;if(!(value instanceof Blob))abort(fail("generation_operation_missing"));else file=value;};for(const v of [s,o])v.count().onsuccess=e=>{if((e.target as IDBRequest<number>).result!==1)abort(fail("generation_operation_diverged"));};
 });
}
export function publishGenerationOperation(db:IDBDatabase,before:GenerationOperationRecord,guard:()=>void):Promise<GenerationOperationRecord>{
 schema(db);guard();if(before.phase!=="prepared")throw fail("generation_operation_diverged");const next=checkGenerationOperationRecord({...before,phase:"operational"},before);
 return new Promise((resolve,reject)=>{const tx=db.transaction([operations,origins],"readwrite",{durability:"strict"});let reason:unknown;const abort=(e:unknown)=>{reason=e;try{tx.abort();}catch{}};tx.onabort=()=>reject(reason??fail());tx.oncomplete=()=>resolve(next);const s=tx.objectStore(operations),o=tx.objectStore(origins);try{store(s);store(o);}catch(e){abort(e);return;}
  for(const v of [s,o])v.count().onsuccess=e=>{if((e.target as IDBRequest<number>).result!==1)abort(fail("generation_operation_diverged"));};s.get(stateKey).onsuccess=e=>{try{guard();if(JSON.stringify(checkGenerationOperationRecord((e.target as IDBRequest).result,before))!==JSON.stringify(before))throw fail("generation_operation_diverged");s.put(next,stateKey);}catch(error){abort(error);}};o.get(originKey).onsuccess=e=>{if(!((e.target as IDBRequest).result instanceof Blob))abort(fail("generation_operation_diverged"));};
 });
}
