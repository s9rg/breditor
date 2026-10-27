/** This private diagnostic leaves all existing room-run error meanings intact. */
import {SharedEditorError} from '../core.js';
export function coldSourceRequiresReconciliation(){return new SharedEditorError('cold_room_execution_requires_reconciliation','Preserve the current original and prepare a new complete room reconciliation before replacement');}
