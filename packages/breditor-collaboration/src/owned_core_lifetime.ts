/** Canonical terminal operations for constructor-owned cores. Only owning session
 * implementations use these; borrowed recovery readers receive no disposal port.
 * A caller's replacement public method or core getter must not redirect cleanup. */
import {SharedRichEditor} from './core.js';
import type {SharedSelectionPolicy} from './types.js';
const retire=SharedRichEditor.prototype.retire,dispose=SharedRichEditor.prototype.dispose;
export function retireOwnedCore<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>):void{retire.call(core);}
export function disposeOwnedCore<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>):void{dispose.call(core);}
