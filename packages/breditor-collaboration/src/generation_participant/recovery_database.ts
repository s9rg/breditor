/** Exact new attempt and retained original file. No stored readiness is an activation grant. */
import {generationParticipantFailure as fail} from "./policy.js";
import {generationFields} from "../generation_source/identity.js";
import type {SharedGenerationParticipantRecoveryProgress} from "./recovery_contract.js";
export interface GenerationRecoveryRecord extends SharedGenerationParticipantRecoveryProgress{format:"breditor/shared-generation-participant-recovery";formatVersion:1;plan:string}
const attempts="generation_attempts",files="generation_files",key="attempt",fileKey="original";
export function checkGenerationRecoveryRecord(raw:unknown,expected:GenerationRecoveryRecord):GenerationRecoveryRecord{
 if(!generationFields(raw,"format,formatVersion,phase,plan,source,uploads"))throw fail("generation_participant_diverged");const r=raw as unknown as GenerationRecoveryRecord;
 if(r.format!==expected.format||r.formatVersion!==1||r.plan!==expected.plan||!["preparing","ready"].includes(r.phase)||!["reserved","started","complete"].includes(r.source)||!["reserved","started","complete"].includes(r.uploads)||r.source!=="complete"&&r.uploads!=="reserved"||r.phase==="ready"&&(r.source!=="complete"||r.uploads!=="complete"))throw fail("generation_participant_diverged");return {...r};
}
function schema(db:IDBDatabase):void{if(db.version!==1||[...db.objectStoreNames].sort().join(",")!=="generation_attempts,generation_files")throw fail("generation_participant_diverged");}
export function createGenerationRecoveryDatabase(name:string,record:GenerationRecoveryRecord,file:Blob):Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);let created=false,blocked=false;r.onupgradeneeded=e=>{if(e.oldVersion!==0){r.transaction!.abort();return;}created=true;r.result.createObjectStore(attempts).add(record,key);r.result.createObjectStore(files).add(file,fileKey);};r.onerror=()=>reject(fail());r.onblocked=()=>{blocked=true;reject(fail("generation_participant_exists"));};r.onsuccess=()=>{if(!created||blocked){r.result.close();reject(fail("generation_participant_exists"));}else resolve(r.result);};});
}
export function readGenerationRecoveryDatabase(db:IDBDatabase,expected:GenerationRecoveryRecord):Promise<{record:GenerationRecoveryRecord;file:Blob}>{
 schema(db);return new Promise((resolve,reject)=>{let record:GenerationRecoveryRecord,file:Blob,reason:unknown;const tx=db.transaction([attempts,files],"readonly"),a=tx.objectStore(attempts),f=tx.objectStore(files),abort=(e:unknown)=>{reason=e;try{tx.abort();}catch{}};
  tx.oncomplete=()=>resolve({record,file});tx.onabort=()=>reject(reason??fail());for(const s of [a,f])if(s.keyPath!==null||s.autoIncrement||s.indexNames.length){abort(fail("generation_participant_diverged"));return;}
  a.get(key).onsuccess=e=>{try{record=checkGenerationRecoveryRecord((e.target as IDBRequest).result,expected);}catch(error){abort(error);}};f.get(fileKey).onsuccess=e=>{const value=(e.target as IDBRequest).result;if(!(value instanceof Blob))abort(fail("generation_participant_missing"));else file=value;};for(const s of [a,f])s.count().onsuccess=e=>{if((e.target as IDBRequest<number>).result!==1)abort(fail("generation_participant_diverged"));};
 });
}
export function writeGenerationRecoveryRecord(db:IDBDatabase,before:GenerationRecoveryRecord,next:GenerationRecoveryRecord,guard:()=>void):Promise<void>{
  schema(db);return new Promise((resolve,reject)=>{let reason:unknown;const tx=db.transaction(attempts,"readwrite",{durability:"strict"}),s=tx.objectStore(attempts),r=s.get(key);r.onsuccess=()=>{try{guard();if(JSON.stringify(checkGenerationRecoveryRecord(r.result,before))!==JSON.stringify(before))throw fail("generation_participant_diverged");checkGenerationRecoveryRecord(next,before);const rank=(v:string)=>["reserved","started","complete"].indexOf(v);if(rank(next.source)<rank(before.source)||rank(next.uploads)<rank(before.uploads)||before.phase==="ready"&&next.phase!=="ready")throw fail("generation_participant_diverged");s.put(next,key);}catch(e){reason=e;try{tx.abort();}catch{}}};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(reason??fail());});
}
