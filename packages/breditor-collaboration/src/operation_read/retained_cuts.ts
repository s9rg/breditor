/** Preserve every typed immutable journal cut, including rows no longer named
 * by CURRENT/PENDING. This is opt-in recovery data, not a table-shaped owner.
 * The actual journal admits every row before calling this projection. */
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import {copyOperationCut,sameOperationCut} from '../independent_operation/cut_codec.js';
export interface RetainedOperationCut{readonly id:string;readonly cut:IndependentHistoryCut}
export function retainedOperationCuts(rows:ReadonlyMap<string,IndependentHistoryCut>){return[...rows].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([id,cut])=>({id,cut:copyOperationCut(cut)}));}
export function sameRetainedOperationCuts(a:ReadonlyMap<string,IndependentHistoryCut>,b:ReadonlyMap<string,IndependentHistoryCut>):boolean{return a.size===b.size&&[...a].every(([id,cut])=>sameOperationCut(b.get(id),cut));}
export function sameRetainedCutLists(a:readonly RetainedOperationCut[]|undefined,b:readonly RetainedOperationCut[]|undefined):boolean{return a===undefined||b===undefined?a===b:a.length===b.length&&a.every((row,i)=>row.id===b[i]?.id&&sameOperationCut(b[i]?.cut,row.cut));}
