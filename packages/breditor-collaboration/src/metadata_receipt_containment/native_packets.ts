/** Captured Native facade intrinsics; public shadows cannot replace packet identity reads. */
import {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
const p=SharedRichEditor.prototype,version=p.readVersion,suggestion=p.readSuggestion,revision=p.readSuggestionRevision;
export function receiptPacketReaders(core:SharedRichEditor<SharedSelectionPolicy>){return Object.freeze({
 version:(packet:string)=>version.call(core,packet),suggestion:(packet:string)=>suggestion.call(core,packet),
 revision:(parent:string,packet:string)=>revision.call(core,parent,packet),
});}
