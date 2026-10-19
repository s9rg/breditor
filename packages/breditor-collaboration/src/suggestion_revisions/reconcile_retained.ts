/** Exact native-admitted revision union, retaining current-only drafts and original terminal outcomes. */
import {SharedRelayError} from "../relay/validation.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import {same} from "../suggestions/validation.js";
import {RetainedSuggestionReceipts} from "../suggestions/recovery_receipts.js";
import {checkQueueRecord} from "../suggestions/database.js";
import {admitSuggestionRecord} from "../suggestions/record_admission.js";
import type {SharedSuggestionQueueRecord} from "../suggestions/types.js";
import {checkRevisionRecord} from "./database.js";
import {admitRevisionRecord} from "./record_admission.js";
import type {SharedSuggestionRevisionsRecord,SharedSuggestionRevisionRow} from "./types.js";
import type {SharedRetainedRevisionsRecoveryResult} from "./reconcile_types.js";
export function reconcileRetainedRevisions<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,before:SharedSuggestionRevisionsRecord,input:SharedSuggestionRevisionsRecord,queues:readonly SharedSuggestionQueueRecord[]):{record:SharedSuggestionRevisionsRecord;result:SharedRetainedRevisionsRecoveryResult}{
 const current=checkRevisionRecord(before,before.identity,before.binding),source=checkRevisionRecord(input,current.identity,current.binding),a=admitRevisionRecord(core,current),b=admitRevisionRecord(core,source),left=new Map([...a.keys()].map((id,i)=>[id,current.retained[i]!])),right=new Map([...b.keys()].map((id,i)=>[id,source.retained[i]!])),retained:SharedSuggestionRevisionRow[]=[],events=new RetainedSuggestionReceipts();
 if(!queues.length)throw new SharedRelayError("suggestion_recovery_source");const history=queues[0]!.format==="breditor/shared-owned-suggestion-queue"?"reviewed-v1":undefined;
 for(const queue of queues){const checked=checkQueueRecord(queue,current.identity,history);admitSuggestionRecord(core,checked,history);events.queue(checked);}
 for(const row of [...current.retained,...source.retained]){if(row.receipt)events.revision(row.receipt);if(row.conflict){events.decision(row.conflict.decision);if(row.conflict.successor)events.revision(row.conflict.successor);}}
 events.finish();let added=0,updated=0,unchanged=0;
 for(const id of new Set([...left.keys(),...right.keys()])){
  const l=left.get(id),r=right.get(id),value=l??r!;
  if(l&&r&&(l.packet!==r.packet||l.previousPacket!==r.previousPacket)||l?.receipt&&r?.receipt&&!same(l.receipt,r.receipt))throw new SharedRelayError("suggestion_recovery_conflict");
  const receipt=l?.receipt??r?.receipt??null,lc=l?.conflict,rc=r?.conflict;
  if(lc&&rc&&(!same(lc.decision,rc.decision)||lc.successor&&rc.successor&&!same(lc.successor,rc.successor)))throw new SharedRelayError("suggestion_recovery_conflict");
  const conflict=lc||rc?{decision:(lc??rc)!.decision,successor:lc?.successor??rc?.successor??null}:null;
  if(receipt&&conflict)throw new SharedRelayError("suggestion_recovery_conflict");
  if(!receipt&&!conflict&&l&&r&&l.retry!==r.retry)throw new SharedRelayError("suggestion_recovery_intent_conflict");
  const row:SharedSuggestionRevisionRow={previousPacket:value.previousPacket,packet:value.packet,retry:receipt||conflict?false:value.retry,receipt,conflict};retained.push(row);
  if(!l)added++;else if(same(l,row))unchanged++;else updated++;
 }
 const record=checkRevisionRecord({...current,retained},current.identity,current.binding);admitRevisionRecord(core,record);
 return{record,result:Object.freeze({added,updated,unchanged,retained:retained.length,queued:retained.filter(r=>r.retry).length,receipts:retained.filter(r=>r.receipt).length,conflicts:retained.filter(r=>r.conflict).length})};
}
