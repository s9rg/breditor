/** Closed transport metadata only. Native code remains the sole document/proposal validator. */
import {SharedRelayError,object,decimal,string,writer,counter} from "../relay/validation.js";
import type {SharedSuggestionPermissions,SharedSuggestionRelayBinding,SharedSuggestionsCursor} from "../relay/suggestion_types.js";
import type {SharedSuggestionQueueIdentity,SharedSuggestionPublication,SharedSuggestionDecision} from "./types.js";
import type {SharedSuggestionConflictTarget,SharedSuggestionDependency} from "../suggestion_types.js";
import {keys,publication,decision} from "./validation.js";

export function suggestionBinding(input:SharedSuggestionRelayBinding):SharedSuggestionRelayBinding {
 const value=object(input);keys(value,"binding,effectWriter");
 const binding=string(value["binding"],64);if(!/^[a-f0-9]{64}$/.test(binding))throw new SharedRelayError("suggestion_lane_mismatch");
 return Object.freeze({binding,effectWriter:writer(value["effectWriter"])});
}
export function suggestionDescriptor(input:unknown,expected:SharedSuggestionRelayBinding&{room:string}):void {
 const value=object(input);keys(value,"binding,document,effectWriter,format,formatVersion");
 if(value["format"]!=="breditor/relay-document-suggestions"||value["formatVersion"]!==1||value["document"]!==expected.room||value["binding"]!==expected.binding||value["effectWriter"]!==expected.effectWriter)throw new SharedRelayError("suggestion_lane_mismatch");
}
export function suggestionPermissions(input:unknown):SharedSuggestionPermissions {
 const value=object(input);keys(value,"canAccept,canPropose,canReject,role");
 const role=value["role"];
 if((role!==null&&role!=="propose"&&role!=="review")||typeof value["canAccept"]!=="boolean"||value["canPropose"]!==(role!==null)||value["canReject"]!==(role==="review")||value["canAccept"]&&role!=="review")throw new SharedRelayError("suggestion_permissions_invalid");
 return {role,canPropose:value["canPropose"] as boolean,canAccept:value["canAccept"],canReject:value["canReject"] as boolean};
}
export interface SuggestionEntry {publication:SharedSuggestionPublication;decision:SharedSuggestionDecision|null}
export function suggestionEntry(input:unknown,identity:SharedSuggestionQueueIdentity):SuggestionEntry {
 const value=object(input);keys(value,"decision,publication");const published=publication(value["publication"]),decided=value["decision"]===null?null:decision(value["decision"],identity);
 if(decided&&(decided.suggestionId!==published.suggestion.id||BigInt(decided.sequence)<=BigInt(published.sequence)))throw new SharedRelayError("suggestion_receipt_mismatch");
 return {publication:published,decision:decided};
}
export function suggestionCursor(input:unknown,binding:string):SharedSuggestionsCursor {
 const value=object(input);keys(value,"after,binding,through");const after=decimal(value["after"]),through=decimal(value["through"]);
 if(value["binding"]!==binding||BigInt(after)>BigInt(through))throw new SharedRelayError("suggestion_cursor_invalid");return {binding,after,through};
}
export function suggestionDependencies(input:unknown):readonly SharedSuggestionDependency[] {
 if(!Array.isArray(input)||!input.length||input.length>1024)throw new SharedRelayError("suggestion_dependencies_invalid");
 return input.map(item=>{const value=object(item);keys(value,"counter,writer");const end=counter(value["counter"]);if(end==="0")throw new SharedRelayError("suggestion_dependencies_invalid");return {writer:writer(value["writer"]),counter:end};});
}
export function suggestionConflicts(input:unknown):readonly SharedSuggestionConflictTarget[] {
 if(!Array.isArray(input)||!input.length||input.length>4096)throw new SharedRelayError("suggestion_conflicts_invalid");
 return input.map(item=>{const value=object(item),kind=value["kind"],label=(key:string)=>string(value[key],256);
  switch(kind){
   case "document":keys(value,"kind");return {kind};
   case "block":case "characters":case "header":keys(value,"block,kind");return {kind,block:label("block")};
   case "children":keys(value,"kind,parent");return {kind,parent:value["parent"]===null?null:label("parent")};
   case "property":keys(value,"block,kind,property");return {kind,block:label("block"),property:label("property")};
   case "column":keys(value,"block,column,kind");return {kind,block:label("block"),column:label("column")};
   default:throw new SharedRelayError("suggestion_conflicts_invalid");
  }
 });
}
