/** Inspect the entire local source before any open capable of autosave. */
import {inspectExactHistoryDestination} from '../independent_history/exact_destination.js';
import type {IndependentHistoryCut,IndependentHistoryIdentity} from '../independent_history/contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {PreparedIndependentRecovery} from './prepare.js';
import {independentRecoveryFailure as fail} from './policy.js';

export async function inspectIndependentDestination<P extends SharedSelectionPolicy>(p:PreparedIndependentRecovery<P>){
 return inspectIndependentHistoryDestination(p.options.destinations.source,p.options.expected.identity.source.native,p.cut,p.guard);
}
export function inspectIndependentHistoryDestination(
 database:string,id:IndependentHistoryIdentity['native'],cut:IndependentHistoryCut,guard:()=>void,
){
 return inspectExactHistoryDestination(database,['history_files','history_heads'],[id.room,id.writer],
  {cut,fail:()=>fail('independent_recovery_diverged')},guard);
}
