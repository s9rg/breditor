/** Inspect the entire dedicated source before opening anything capable of autosave. */
import {inspectExactHistoryDestination} from '../independent_history/exact_destination.js';
import type {IndependentHistoryCut,IndependentHistoryIdentity} from '../independent_history/contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {PreparedIndependentDeliveryRecovery} from './prepare.js';
import {independentDeliveryRecoveryFailure as fail} from './policy.js';

export async function inspectIndependentDeliveryDestination<P extends SharedSelectionPolicy>(p:PreparedIndependentDeliveryRecovery<P>){
 return inspectDeliveryHistoryDestination(p.options.destinations.source,p.options.expected.identity.source.history.native,p.cut,p.guard);
}
export function inspectDeliveryHistoryDestination(
 database:string,id:IndependentHistoryIdentity['native'],cut:IndependentHistoryCut,guard:()=>void,
){
 return inspectExactHistoryDestination(database,['delivery_history_files','delivery_history_heads'],[id.room,id.writer],
  {cut,fail:()=>fail('independent_delivery_recovery_diverged')},guard);
}
