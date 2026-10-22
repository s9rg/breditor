/** Private local-operation storage profile, not a delivery companion. It has no
 * relay binding, packet capture, receipt admission or transport methods. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryHead,IndependentHistoryCut,IndependentHistoryStoredCut} from './contract.js';
export interface IndependentLocalOperationDriver{
 readonly operation:object;readonly storage:'local-operation-v1';
 readonly readHead:(input:string)=>IndependentHistoryHead;
 readonly wrap:(input:string)=>string;
 readonly nativeCaptureGuard:Readonly<{check():void;capture(core:SharedRichEditor<SharedSelectionPolicy>,versions:readonly string[]):void;signal:AbortSignal|undefined}>;
 readonly persistence:Readonly<{
  select(actual:IndependentHistoryStoredCut|null):Promise<IndependentHistoryStoredCut|null>;
  prepare(expected:string|null,cut:IndependentHistoryCut):Promise<void>;
  acknowledge(cut:IndependentHistoryCut):Promise<void>;
  release():Promise<void>;
 }>;
}
const selected=new WeakMap<object,IndependentLocalOperationDriver>();
/** Internal factory binding only. No stored/public field selects this profile;
 * the operational opener separately admits the genuine journal and reservation. */
export function bindIndependentLocalOperationDriver<T extends object>(options:T,driver:IndependentLocalOperationDriver):T{selected.set(options,driver);return options;}
export const selectedLocalOperationDriver=(input:object):IndependentLocalOperationDriver|undefined=>selected.get(input);
