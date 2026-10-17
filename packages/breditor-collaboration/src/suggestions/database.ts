/** Dedicated queue database; live document/review journals and credentials never reside here. */
import {SharedRelayError,object} from "../relay/validation.js";
import {keys,queueIdentity,publication,intent,decision,packetText,utf8} from "./validation.js";
import type {SharedSuggestionQueueIdentity,SharedSuggestionQueueRecord} from "./types.js";
export function queueKey(identity:SharedSuggestionQueueIdentity):string{return JSON.stringify([identity.endpoint,identity.room,identity.binding,identity.principal,identity.documentWriter,identity.effectWriter]);}
export function checkQueueRecord(input:unknown,identity:SharedSuggestionQueueIdentity):SharedSuggestionQueueRecord {
 const value=object(input);keys(value,"format,formatVersion,identity,retained");if(value["format"]!=="breditor/shared-suggestion-queue"||value["formatVersion"]!==1)throw new SharedRelayError("suggestion_queue_family");
 const raw=object(value["identity"]);keys(raw,"binding,documentWriter,effectWriter,endpoint,principal,room,writerTransport");const bound=queueIdentity(raw as unknown as SharedSuggestionQueueIdentity);if(JSON.stringify(bound)!==JSON.stringify(identity))throw new SharedRelayError("suggestion_queue_identity");
 const retained=value["retained"];if(!Array.isArray(retained)||retained.length>256||utf8(JSON.stringify(value))>32*1024*1024)throw new SharedRelayError("suggestion_queue_budget");
 return {format:"breditor/shared-suggestion-queue",formatVersion:1,identity:bound,retained:retained.map(input=>{
  const row=object(input);keys(row,"decision,intent,origin,packet,publication,publish");
  if((row["origin"]!=="local"&&row["origin"]!=="remote")||typeof row["publish"]!=="boolean")throw new SharedRelayError("suggestion_queue_intent");
  const published=row["publication"]===null?null:publication(row["publication"]),desired=row["intent"]===null?null:intent(row["intent"]),final=row["decision"]===null?null:decision(row["decision"],identity);
  if(row["origin"]==="remote"&&!published||row["publish"]&&(row["origin"]!=="local"||published!==null)||final&&(!published||final.suggestionId!==published.suggestion.id||BigInt(final.sequence)<=BigInt(published.sequence)||desired?.retry))throw new SharedRelayError("suggestion_queue_intent");
  return {packet:packetText(row["packet"]),origin:row["origin"],publish:row["publish"],publication:published,intent:desired,decision:final};
 })};
}
export function openQueueDatabase(name:string):Promise<IDBDatabase>{
 if(!name||name.length>200)throw new SharedRelayError("suggestion_database_name");
 return new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);let blocked=false;request.onupgradeneeded=()=>request.result.createObjectStore("suggestions");request.onerror=()=>reject(request.error??new SharedRelayError("suggestion_database"));request.onblocked=()=>{blocked=true;reject(new SharedRelayError("suggestion_database_blocked"));};request.onsuccess=()=>{if(blocked)request.result.close();else if(request.result.objectStoreNames.length!==1||!request.result.objectStoreNames.contains("suggestions")){request.result.close();reject(new SharedRelayError("suggestion_database_family"));}else resolve(request.result);};});
}
export function readQueueRecord(db:IDBDatabase,identity:SharedSuggestionQueueIdentity):Promise<SharedSuggestionQueueRecord|null>{return new Promise((resolve,reject)=>{const tx=db.transaction("suggestions","readonly"),request=tx.objectStore("suggestions").get(queueKey(identity));let record:SharedSuggestionQueueRecord|null=null,failure:unknown;request.onsuccess=()=>{try{if(request.result!==undefined)record=checkQueueRecord(request.result,identity);}catch(error){failure=error;tx.abort();}};tx.oncomplete=()=>resolve(record);tx.onabort=()=>reject(failure??tx.error??new SharedRelayError("suggestion_queue_read"));});}
export function writeQueueRecord(db:IDBDatabase,identity:SharedSuggestionQueueIdentity,record:SharedSuggestionQueueRecord):Promise<void>{try{checkQueueRecord(record,identity);}catch(error){return Promise.reject(error);}return new Promise((resolve,reject)=>{const tx=db.transaction("suggestions","readwrite");tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new SharedRelayError("suggestion_queue_write"));try{tx.objectStore("suggestions").put(record,queueKey(identity));}catch(error){tx.abort();reject(error);}});}
