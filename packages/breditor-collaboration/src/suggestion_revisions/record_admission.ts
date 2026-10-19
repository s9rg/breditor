/** Pure original revision admission; never publishes children or starts a borrowed transport. */
import {SharedRelayError} from "../relay/validation.js";
import {same} from "../suggestions/validation.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSuggestionRevisionInfo} from "../suggestion_types.js";
import type {SharedSuggestionRevisionsRecord} from "./types.js";
export function admitRevisionRecord<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,record:SharedSuggestionRevisionsRecord):Map<string,SharedSuggestionRevisionInfo>{
 const infos=new Map<string,SharedSuggestionRevisionInfo>();for(const row of record.retained){const info=core.readSuggestionRevision(row.previousPacket,row.packet);if(info.suggestion.author!==record.identity.principal||core.verifySuggestionRevision(row.previousPacket,row.packet).kind!=="verified"||infos.has(info.id))throw new SharedRelayError("suggestion_revision_local_source_missing");
  if(row.receipt&&!same(row.receipt.revision,info)||row.conflict&&(row.conflict.decision.suggestionId!==info.previousSuggestionId||row.conflict.successor&&row.conflict.successor.revision.previousSuggestionId!==info.previousSuggestionId))throw new SharedRelayError("suggestion_revision_receipt_mismatch");
  if(row.conflict?.decision.effect&&core.retainedWriterReceiptV2(row.conflict.decision.effect.writerGroup).kind!=="verified")throw new SharedRelayError("suggestion_revision_conflict_effect_not_retained");infos.set(info.id,info);
 }return infos;
}
