/** All-or-refuse exact packet/intent retention; never adopts history or finalizes a decision. */
import {SharedRelayError} from "../relay/validation.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import {checkQueueRecord} from "./database.js";
import {admitSuggestionRecord} from "./record_admission.js";
import {same} from "./validation.js";
import {RetainedSuggestionReceipts} from "./recovery_receipts.js";
import type {SharedSuggestionQueueRecord,SharedRetainedSuggestion} from "./types.js";
import type {SharedRetainedSuggestionsRecoveryResult} from "./reconcile_types.js";
function agreed<T>(left:T|null|undefined,right:T|null|undefined):T|null{if(left&&right&&!same(left,right))throw new SharedRelayError("suggestion_recovery_conflict");return left??right??null;}
export function reconcileRetainedSuggestions<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,before:SharedSuggestionQueueRecord,input:SharedSuggestionQueueRecord,history?:"reviewed-v1"):{record:SharedSuggestionQueueRecord;result:SharedRetainedSuggestionsRecoveryResult}{
 const current=checkQueueRecord(before,before.identity,history),source=checkQueueRecord(input,current.identity,history),a=admitSuggestionRecord(core,current,history),b=admitSuggestionRecord(core,source,history),retained:SharedRetainedSuggestion[]=[],receipts=new RetainedSuggestionReceipts();
 receipts.queue(current);receipts.queue(source);receipts.finish();let added=0,updated=0,unchanged=0;
 for(const id of new Set([...a.keys(),...b.keys()])){
  const left=a.get(id)?.row,right=b.get(id)?.row,value=left??right!;
  if(left&&right&&left.packet!==right.packet)throw new SharedRelayError("suggestion_recovery_conflict");
  const publication=agreed(left?.publication,right?.publication),decision=agreed(left?.decision,right?.decision),li=left?.intent,ri=right?.intent;
  // A timestamp is payload, not a trusted cross-copy ordering. Do not discard a
  // different choice even when the authenticated final outcome is already known.
  if(li&&ri&&(li.requested!==ri.requested||li.queuedAtMs!==ri.queuedAtMs||!decision&&li.retry!==ri.retry)||!publication&&left&&right&&left.publish!==right.publish)throw new SharedRelayError("suggestion_recovery_intent_conflict");
  const desired=li??ri??null,row:SharedRetainedSuggestion={packet:value.packet,origin:left?.origin==="local"||right?.origin==="local"?"local":"remote",publish:publication?false:value.publish,publication,intent:desired?{...desired,retry:decision?false:desired.retry}:null,decision};retained.push(row);
  if(!left)added++;else if(same(left,row))unchanged++;else updated++;
 }
 const record=checkQueueRecord({...current,retained},current.identity,history);admitSuggestionRecord(core,record,history);
 return{record,result:Object.freeze({added,updated,unchanged,retained:retained.length,queuedPublications:retained.filter(r=>r.publish).length,queuedDecisions:retained.filter(r=>r.intent?.retry).length,publications:retained.filter(r=>r.publication).length,decisions:retained.filter(r=>r.decision).length})};
}
