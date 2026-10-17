/** Frozen, bounded LIVE discovery. This is not a persisted cursor or the selected packet cache. */
import {SharedRelayError,object} from "../relay/validation.js";
import type {SharedSuggestionRelayRequest,SharedSuggestionsCursor,SharedSuggestionPermissions} from "../relay/suggestion_types.js";
import type {SharedSuggestionQueueIdentity} from "./types.js";
import {suggestionDescriptor,suggestionPermissions,suggestionCursor,suggestionEntry,type SuggestionEntry} from "./transport.js";
import {keys,publication,decision,same} from "./validation.js";
export interface SuggestionFeed {entries:Map<string,SuggestionEntry>;through:string;permissions:SharedSuggestionPermissions}
export async function readSuggestionFeed(request:(input:SharedSuggestionRelayRequest)=>Promise<Record<string,unknown>>,identity:SharedSuggestionQueueIdentity):Promise<SuggestionFeed>{
 const entries=new Map<string,SuggestionEntry>();let cursor:SharedSuggestionsCursor|null=null,permissions:SharedSuggestionPermissions|undefined,events=0;
 for(let pages=0;pages<33;pages++){
  const response=await request({kind:"suggestionSync",cursor});keys(response,"kind,page");if(response["kind"]!=="suggestionsPage")throw new SharedRelayError("suggestion_protocol_error");
  const page=object(response["page"]);keys(page,"cursor,descriptor,more,permissions,updates");suggestionDescriptor(page["descriptor"],identity);permissions=suggestionPermissions(page["permissions"]);
  const next=suggestionCursor(page["cursor"],identity.binding),updates=page["updates"];
  if(!Array.isArray(updates)||updates.length>64||typeof page["more"]!=="boolean"||cursor&&next.through!==cursor.through)throw new SharedRelayError("suggestion_page_invalid");
  let after=cursor?.after??"0";
  for(const input of updates){
   if(++events>2048)throw new SharedRelayError("suggestion_feed_budget");const update=object(input);keys(update,"data,kind");let sequence:string;
   if(update["kind"]==="published"){
    const value=publication(update["data"]);sequence=value.sequence;
    if(entries.has(value.suggestion.id)||entries.size>=1024)throw new SharedRelayError("suggestion_feed_invalid");entries.set(value.suggestion.id,{publication:value,decision:null});
   }else if(update["kind"]==="decided"){
    const value=decision(update["data"],identity),known=entries.get(value.suggestionId);sequence=value.sequence;
    if(!known||known.decision)throw new SharedRelayError("suggestion_feed_invalid");entries.set(value.suggestionId,suggestionEntry({publication:known.publication,decision:value},identity));
   }else throw new SharedRelayError("suggestion_feed_invalid");
   if(BigInt(sequence)<=BigInt(after)||BigInt(sequence)>BigInt(next.through))throw new SharedRelayError("suggestion_page_invalid");after=sequence;
  }
  if(updates.length?next.after!==after:cursor?next.after!==cursor.after:next.after!==next.through)throw new SharedRelayError("suggestion_page_invalid");
  if(page["more"]!==(BigInt(next.after)<BigInt(next.through))||page["more"]&&!updates.length)throw new SharedRelayError("suggestion_page_invalid");
  cursor=next;if(!page["more"])return {entries,through:next.through,permissions};
 }
 throw new SharedRelayError("suggestion_feed_budget");
}
/** Older hosts or contradictory retained events never silently replace previously observed truth. */
export function checkSuggestionFeed(previous:Iterable<SuggestionEntry>,next:SuggestionFeed):void {
 for(const known of previous){const current=next.entries.get(known.publication.suggestion.id);if(!current||!same(current.publication,known.publication)||known.decision&&!same(current.decision,known.decision))throw new SharedRelayError("suggestion_server_rollback");}
}
