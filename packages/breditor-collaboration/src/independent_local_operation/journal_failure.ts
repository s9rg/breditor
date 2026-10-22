/** Closed local-operation failures; original delivery error meanings stay intact. */
import {SharedEditorError} from '../core.js';
export const localJournalFailure=(code='independent_local_operation_storage')=>new SharedEditorError(code,'Use the genuine local operation journal, exact native cuts and current explicit host policy');
