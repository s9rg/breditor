/** Stable failures for the explicit operational source/journal family. */
import {SharedEditorError} from '../core.js';
export const operationJournalFailure=(code='independent_operation_journal')=>new SharedEditorError(code,'Retain the original participant and exact current/pending source cuts; no state was inferred or overwritten');
