/** Private factory selection. Stored fields never choose a native/store companion. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryHead} from './contract.js';
export interface IndependentHistoryCompanion {
 readonly readHead:(input:string)=>IndependentHistoryHead;
 load(input:string):void;capture():string;
 admit(core:SharedRichEditor<SharedSelectionPolicy>):void;
 wrap(source:IndependentHistoryHead,capture:string):string;
 acknowledged(capture:string):void;retire():void;
}
const selected=new WeakMap<object,IndependentHistoryCompanion>();
export function withIndependentDeliveryCompanion<T extends object>(options:T,companion:IndependentHistoryCompanion):T{const copy={...options};selected.set(copy,companion);return copy;}
export const independentDeliveryCompanion=(options:object):IndependentHistoryCompanion|undefined=>selected.get(options);
