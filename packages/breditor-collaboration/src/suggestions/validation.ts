/** Closed transport/cache metadata only. Rust alone validates native proposal AST/source/lineage. */
import {SharedRelayError,object,string,decimal,digest,writer,counter,endpoint} from "../relay/validation.js";
import type {SharedDocumentSuggestionInfo} from "../suggestion_types.js";
import type {SharedSuggestionQueueIdentity,SharedSuggestionPublication,SharedSuggestionDecision,SharedSuggestionDecisionIntent} from "./types.js";
export const utf8=(value:string):number=>new TextEncoder().encode(value).length;
export function keys(value:Record<string,unknown>,expected:string):void{if(Object.keys(value).sort().join(",")!==expected)throw new SharedRelayError("suggestion_metadata_fields");}
function label(input:unknown,max:number):string{const value=string(input,max);if(!value.trim()||utf8(value)>max||/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(value))throw new SharedRelayError("suggestion_metadata_invalid");return value;}
export function queueIdentity(input:SharedSuggestionQueueIdentity):SharedSuggestionQueueIdentity {
 if(input.writerTransport!=="atomic-v2"||!/^[a-f0-9]{64}$/.test(string(input.binding,64)))throw new SharedRelayError("suggestion_queue_identity");
 const documentWriter=writer(input.documentWriter),effectWriter=writer(input.effectWriter);if(documentWriter===effectWriter)throw new SharedRelayError("suggestion_queue_identity");
 return {endpoint:endpoint(input.endpoint),principal:label(input.principal,128),room:label(input.room,200),binding:input.binding,documentWriter,effectWriter,writerTransport:"atomic-v2"};
}
export function suggestionInfo(input:unknown):SharedDocumentSuggestionInfo{const value=object(input);keys(value,"author,createdAtMs,id,title");return {id:digest(value["id"]),title:label(value["title"],256),author:label(value["author"],128),createdAtMs:decimal(value["createdAtMs"])};}
export function publication(input:unknown):SharedSuggestionPublication{const value=object(input);keys(value,"sequence,suggestion");const sequence=decimal(value["sequence"]);if(sequence==="0")throw new SharedRelayError("suggestion_sequence");return {sequence,suggestion:suggestionInfo(value["suggestion"])};}
export function intent(input:unknown):SharedSuggestionDecisionIntent {const value=object(input);keys(value,"queuedAtMs,requested,retry");if((value["requested"]!=="accept"&&value["requested"]!=="reject")||typeof value["retry"]!=="boolean")throw new SharedRelayError("suggestion_intent");return {requested:value["requested"],queuedAtMs:decimal(value["queuedAtMs"]),retry:value["retry"]};}
export function decision(input:unknown,identity:SharedSuggestionQueueIdentity):SharedSuggestionDecision {
 const value=object(input);keys(value,value["acceptingWriter"]===undefined?"decision,effect,principal,sequence,suggestionId":"acceptingWriter,decision,effect,principal,sequence,suggestionId");
 const sequence=decimal(value["sequence"]),principal=label(value["principal"],128),suggestionId=digest(value["suggestionId"]);
 if(sequence==="0"||(value["decision"]!=="accept"&&value["decision"]!=="reject"))throw new SharedRelayError("suggestion_decision");
 if(value["decision"]==="reject"){if(value["effect"]!==null||value["acceptingWriter"]!==undefined)throw new SharedRelayError("suggestion_decision");return {sequence,principal,suggestionId,decision:"reject",effect:null};}
 const effect=object(value["effect"]);keys(effect,"semanticFrom,writerGroup");const group=object(effect["writerGroup"]);keys(group,"from,groupDigest,prefixDigest,through,writer");
 const from=counter(group["from"]),through=counter(group["through"]),semanticFrom=counter(effect["semanticFrom"]);
 if(group["writer"]!==identity.effectWriter||BigInt(from)>BigInt(semanticFrom)||BigInt(semanticFrom)>=BigInt(through))throw new SharedRelayError("suggestion_effect_identity");
 return {sequence,principal,suggestionId,decision:"accept",...(value["acceptingWriter"]===undefined?{}:{acceptingWriter:writer(value["acceptingWriter"])}),effect:{semanticFrom,writerGroup:{writer:identity.effectWriter,from,through,prefixDigest:digest(group["prefixDigest"]),groupDigest:digest(group["groupDigest"])}}};
}
export function packetText(input:unknown):string{const value=string(input,1048576);if(utf8(value)>1048576)throw new SharedRelayError("suggestion_packet_budget");return value;}
export function same(a:unknown,b:unknown):boolean{return JSON.stringify(a)===JSON.stringify(b);}
