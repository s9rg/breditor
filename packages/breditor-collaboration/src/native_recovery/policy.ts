/** Separate opt-in reservation failures. Original facade defaults are unchanged. */
import {SharedEditorError} from '../shared_editor_error.js';
export type NativeRecoveryFailure='native_recovery_policy'|'native_recovery_busy'|'native_recovery_closed'|'native_recovery_member';
export function nativeRecoveryFailure(code:NativeRecoveryFailure='native_recovery_policy'):SharedEditorError{return new SharedEditorError(code,{
 native_recovery_policy:'Reserve the complete actual native client set with explicit bounded input',
 native_recovery_busy:'Native recovery excludes other publications, remote queues and holds',
 native_recovery_closed:'The native recovery reservation or one of its actual owners ended',
 native_recovery_member:'The actual native editor is not a member of this reservation',
}[code]);}
