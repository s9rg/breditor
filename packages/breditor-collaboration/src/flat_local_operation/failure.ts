/** Separate private flat-local errors. No existing reader acquires this format. */
import {SharedEditorError} from '../core.js';
export function flatLocalFailure(code='flat_local_operation'){return new SharedEditorError(code,'Flat local provenance or actual recovery ownership was refused');}
