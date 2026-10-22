/** Private factory selection. Stored fields never choose a native/store companion. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryHead,IndependentHistoryCut,IndependentHistoryStoredCut} from './contract.js';
export interface IndependentHistoryCompanion {
 readonly readHead:(input:string)=>IndependentHistoryHead;
 /** Explicit private profile; old source schemas stay closed. */
 readonly storage?:'operation-v1'|'restored-operation-v1';
 readonly persistence?:Readonly<{
  select(actual:IndependentHistoryStoredCut|null):Promise<IndependentHistoryStoredCut|null>;
  prepare(expected:string|null,cut:IndependentHistoryCut):Promise<void>;
  acknowledge(cut:IndependentHistoryCut):Promise<void>;
  release():Promise<void>;
 }>;
 /** Optional genuine operation-origin checks; never selected by stored fields. */
 readonly nativeCaptureGuard?:Readonly<{check():void;capture(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[]):void}>;
 load(input:string):void;capture():string;
 admit(core:SharedRichEditor<SharedSelectionPolicy>):void;
 wrap(source:IndependentHistoryHead,capture:string):string;
 acknowledged(capture:string):void;retire():void;
}
const selected=new WeakMap<object,IndependentHistoryCompanion>();
export function withIndependentDeliveryCompanion<T extends object>(options:T,companion:IndependentHistoryCompanion):T{const copy={...options};selected.set(copy,companion);return copy;}
export const independentDeliveryCompanion=(options:object):IndependentHistoryCompanion|undefined=>selected.get(options);
