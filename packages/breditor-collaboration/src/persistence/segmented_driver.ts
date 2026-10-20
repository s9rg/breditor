/** Private explicit storage selection. Payload fields cannot select another factory family. */
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SegmentedHead} from "./segmented_contract.js";
export interface SegmentedSessionCompanion {
 readHead(input:string):SegmentedHead;
 load(input:string):void;
 capture():string;
 admit(core:SharedRichEditor<SharedSelectionPolicy>):void;
 wrap(source:SegmentedHead,capture:string):string;
 acknowledged?(capture:string):void;
 retire?():void;
}
const selected=new WeakMap<object,SegmentedSessionCompanion>();
export function withSegmentedCompanion<T extends object>(options:T,companion:SegmentedSessionCompanion):T{const copy={...options};selected.set(copy,companion);return copy;}
export const segmentedCompanion=(options:object):SegmentedSessionCompanion|undefined=>selected.get(options);
