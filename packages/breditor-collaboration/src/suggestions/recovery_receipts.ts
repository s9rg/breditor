/** Join known immutable server events without manufacturing an order or acceptance.
 * Different records at one sequence, two successors, and contradictory known lineage refuse. */
import {SharedRelayError} from "../relay/validation.js";
import {same} from "./validation.js";
import type {SharedSuggestionPublication,SharedSuggestionDecision,SharedSuggestionQueueRecord} from "./types.js";
import type {SharedSuggestionRevisionReceipt} from "../suggestion_revisions/types.js";
export class RetainedSuggestionReceipts {
 readonly #sequences=new Map<string,{key:string;value:unknown}>();
 readonly #events=new Map<string,unknown>();readonly #parents=new Map<string,SharedSuggestionRevisionReceipt>();readonly #children=new Map<string,SharedSuggestionRevisionReceipt>();
 #add(sequence:string,key:string,value:unknown):void{
  const event=this.#events.get(key),position=this.#sequences.get(sequence);
  if(event&&!same(event,value)||position&&(position.key!==key||!same(position.value,value)))throw new SharedRelayError("suggestion_recovery_conflict");
  this.#events.set(key,value);this.#sequences.set(sequence,{key,value});
 }
 publication(value:SharedSuggestionPublication):void{this.#add(value.sequence,`published:${value.suggestion.id}`,value);}
 decision(value:SharedSuggestionDecision):void{this.#add(value.sequence,`decided:${value.suggestionId}`,value);}
 queue(record:SharedSuggestionQueueRecord):void{for(const row of record.retained){if(row.publication)this.publication(row.publication);if(row.decision)this.decision(row.decision);}}
 revision(value:SharedSuggestionRevisionReceipt):void{
  this.decision(value.previousDecision);this.publication(value.publication);
  const parent=value.revision.previousSuggestionId,child=value.revision.suggestion.id,known=this.#parents.get(parent),owner=this.#children.get(child);
  if(known&&!same(known,value)||owner&&!same(owner,value))throw new SharedRelayError("suggestion_recovery_conflict");
  this.#parents.set(parent,value);this.#children.set(child,value);
 }
 finish():void{
  for(const row of this.#parents.values()){
   const predecessor=this.#children.get(row.revision.previousSuggestionId);
   if(predecessor&&predecessor.rootSuggestionId!==row.rootSuggestionId)throw new SharedRelayError("suggestion_recovery_conflict");
   const visited=new Set<string>();let id=row.revision.suggestion.id;
   while(this.#children.has(id)){if(visited.has(id))throw new SharedRelayError("suggestion_recovery_conflict");visited.add(id);id=this.#children.get(id)!.revision.previousSuggestionId;}
  }
 }
}
