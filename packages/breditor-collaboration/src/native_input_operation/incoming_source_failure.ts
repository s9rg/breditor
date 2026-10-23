/** One private failure family for genuine incoming/native prefix borrows. */
import {SharedEditorError} from '../core.js';
export const nativeInputIncomingFailure=()=>new SharedEditorError('native_input_incoming_source','Select the genuine unchanged incoming archive, actual matching local source and a fresh native read policy');
