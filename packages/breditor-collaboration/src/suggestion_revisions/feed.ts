/** Frozen bounded metadata discovery; no packet download, document mutation or polling. */
import {SharedRelayError,object} from "../relay/validation.js";
import {keys,same} from "../suggestions/validation.js";
import {suggestionCursor,suggestionPermissions} from "../suggestions/transport.js";
import {revisionsDescriptor,revisionReceipt} from "./transport.js";
import type {SharedSuggestionPermissions,SharedSuggestionsCursor} from "../relay/suggestion_types.js";
import type {SharedSuggestionQueueIdentity} from "../suggestions/types.js";
import type {SharedSuggestionRevisionRequest,SharedSuggestionRevisionReceipt} from "./types.js";
export async function readRevisionFeed(request:(input:SharedSuggestionRevisionRequest)=>Promise<Record<string,unknown>>,identity:SharedSuggestionQueueIdentity,binding:string):Promise<{revisions:Map<string,SharedSuggestionRevisionReceipt>;permissions:SharedSuggestionPermissions}> {
 const revisions=new Map<string,SharedSuggestionRevisionReceipt>(),parents=new Set<string>(),children=new Map<string,string>();let cursor:SharedSuggestionsCursor|null=null,permissions:SharedSuggestionPermissions|null=null;
 for(let count=0;count<17;count++){
  const response=await request({kind:"suggestionRevisionSync",cursor});keys(response,"kind,page");if(response["kind"]!=="suggestionRevisionsPage")throw new SharedRelayError("suggestion_revision_protocol_error");
  const page=object(response["page"]);keys(page,"cursor,descriptor,more,permissions,revisions");revisionsDescriptor(page["descriptor"],binding,identity);permissions=suggestionPermissions(page["permissions"]);
  const next=suggestionCursor(page["cursor"],binding),rows=page["revisions"];if(!Array.isArray(rows)||rows.length>64||typeof page["more"]!=="boolean"||page["more"]&&rows.length!==64||cursor&&(next.through!==cursor.through||BigInt(next.after)<BigInt(cursor.after)))throw new SharedRelayError("suggestion_revision_cursor_invalid");
  let after=cursor?.after;
  for(const input of rows){const row=revisionReceipt(input,identity),sequence=row.publication.sequence,previous=row.revision.previousSuggestionId,child=row.revision.suggestion.id;
   if(revisions.size>=1023||revisions.has(row.revision.id)||parents.has(previous)||children.has(child)||after!==undefined&&BigInt(row.previousDecision.sequence)<=BigInt(after)||BigInt(sequence)>BigInt(next.through)||row.rootSuggestionId!==(children.get(previous)??previous))throw new SharedRelayError("suggestion_revision_feed_invalid");
   after=sequence;parents.add(previous);children.set(child,row.rootSuggestionId);revisions.set(row.revision.id,row);
  }
  if(rows.length?next.after!==after:cursor!==null&&next.after!==cursor.after)throw new SharedRelayError("suggestion_revision_cursor_invalid");
  if(!page["more"]){if(next.after!==next.through)throw new SharedRelayError("suggestion_revision_cursor_invalid");return {revisions,permissions};}
  if(next.after===next.through||cursor&&next.after===cursor.after)throw new SharedRelayError("suggestion_revision_cursor_invalid");cursor=next;
 }
 throw new SharedRelayError("suggestion_revision_feed_budget");
}
export function checkRevisionFeed(previous:Iterable<SharedSuggestionRevisionReceipt>,current:Map<string,SharedSuggestionRevisionReceipt>):void{for(const row of previous){if(!same(row,current.get(row.revision.id)))throw new SharedRelayError("suggestion_revision_server_rollback");}}
