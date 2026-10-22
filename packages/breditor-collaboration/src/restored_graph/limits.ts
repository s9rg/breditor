/** Operational input hashing currently uses the existing participant-bounded digest.
 * Do not emit a ready capture larger than its next restore can admit. The flat
 * data framing has a separate aggregate ceiling; streaming growth remains work. */
import {MAX_INDEPENDENT_DELIVERY_PARTICIPANT_BYTES} from '../independent_delivery_participant/codec.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
export const MAX_RESTORED_OPERATION_INPUT_BYTES=MAX_INDEPENDENT_DELIVERY_PARTICIPANT_BYTES;
export function checkRestoredOperationInputBudget(file:Blob):void{if(!(file instanceof Blob)||file.size>MAX_RESTORED_OPERATION_INPUT_BYTES)throw fail('restored_operation_input_budget');}
