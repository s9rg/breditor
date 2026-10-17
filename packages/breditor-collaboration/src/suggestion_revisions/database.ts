/** Separate closed revision recovery store. Old queues are never upgraded or rewritten. */
import {SharedRelayError,object} from "../relay/validation.js";
import {keys,packetText,queueIdentity,same,utf8,decision} from "../suggestions/validation.js";
import {queueKey} from "../suggestions/database.js";
import {revisionsBinding,revisionPacket,revisionReceipt} from "./transport.js";
import type {SharedSuggestionQueueIdentity} from "../suggestions/types.js";
import type {SharedSuggestionRevisionsRecord} from "./types.js";
const store="revisions";
export function revisionKey(identity:SharedSuggestionQueueIdentity,binding:string):string{return JSON.stringify([queueKey(identity),binding]);}
export function checkRevisionRecord(input:unknown,identity:SharedSuggestionQueueIdentity,binding:string):SharedSuggestionRevisionsRecord {
 const value=object(input);keys(value,"binding,format,formatVersion,identity,retained");const raw=object(value["identity"]);keys(raw,"binding,documentWriter,effectWriter,endpoint,principal,room,writerTransport");const bound=queueIdentity(raw as unknown as SharedSuggestionQueueIdentity);
 if(value["format"]!=="breditor/shared-suggestion-revisions"||value["formatVersion"]!==1||!same(bound,identity)||value["binding"]!==revisionsBinding({binding}).binding)throw new SharedRelayError("suggestion_revision_record_identity");
 const rows=value["retained"];if(!Array.isArray(rows)||rows.length>256||utf8(JSON.stringify(value))>32*1024*1024)throw new SharedRelayError("suggestion_revision_record_budget");
 return {format:"breditor/shared-suggestion-revisions",formatVersion:1,identity:bound,binding,retained:rows.map(input=>{
  const row=object(input);keys(row,"conflict,packet,previousPacket,receipt,retry");if(typeof row["retry"]!=="boolean")throw new SharedRelayError("suggestion_revision_record_intent");
  const receipt=row["receipt"]===null?null:revisionReceipt(row["receipt"],identity);let conflict=null;
  if(row["conflict"]!==null){const value=object(row["conflict"]);keys(value,"decision,successor");conflict={decision:decision(value["decision"],identity),successor:value["successor"]===null?null:revisionReceipt(value["successor"],identity)};if(conflict.successor&&!same(conflict.decision,conflict.successor.previousDecision))throw new SharedRelayError("suggestion_revision_receipt_mismatch");}
  if(receipt&&conflict||(receipt||conflict)&&row["retry"])throw new SharedRelayError("suggestion_revision_record_intent");
  return {previousPacket:packetText(row["previousPacket"]),packet:revisionPacket(row["packet"]),retry:row["retry"],receipt,conflict};
 })};
}
export function openRevisionDatabase(name:string):Promise<IDBDatabase>{
 if(!name||name.length>200)throw new SharedRelayError("suggestion_database_name");return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);let blocked=false;r.onupgradeneeded=()=>r.result.createObjectStore(store);r.onerror=()=>reject(r.error??new SharedRelayError("suggestion_revision_database"));r.onblocked=()=>{blocked=true;reject(new SharedRelayError("suggestion_database_blocked"));};r.onsuccess=()=>{if(blocked)r.result.close();else if(r.result.objectStoreNames.length!==1||!r.result.objectStoreNames.contains(store)){r.result.close();reject(new SharedRelayError("suggestion_database_family"));}else resolve(r.result);};});
}
export function readRevisionRecord(db:IDBDatabase,identity:SharedSuggestionQueueIdentity,binding:string):Promise<SharedSuggestionRevisionsRecord|null>{return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).get(revisionKey(identity,binding));let value:SharedSuggestionRevisionsRecord|null=null,failure:unknown;r.onsuccess=()=>{try{if(r.result!==undefined)value=checkRevisionRecord(r.result,identity,binding);}catch(error){failure=error;tx.abort();}};tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(failure??tx.error??new SharedRelayError("suggestion_revision_database"));});}
export function writeRevisionRecord(db:IDBDatabase,record:SharedSuggestionRevisionsRecord):Promise<void>{return new Promise((resolve,reject)=>{let tx:IDBTransaction;try{tx=db.transaction(store,"readwrite",{durability:"strict"});tx.objectStore(store).put(record,revisionKey(record.identity,record.binding));}catch(error){reject(error);return;}tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error??new SharedRelayError("suggestion_revision_record_write"));});}
