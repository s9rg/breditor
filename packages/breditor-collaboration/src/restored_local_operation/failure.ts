/** Local restored provenance is a distinct capability and logical head family. */
import {SharedEditorError} from '../core.js';
export const restoredLocalFailure=(code='restored_local_operation_policy')=>new SharedEditorError(code,'Restore the complete selected local operation under fresh policy without resetting provenance');
