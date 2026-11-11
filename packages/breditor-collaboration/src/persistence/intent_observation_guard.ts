/** The live operation that authorized a Native intent observation. It may
 * end before the independently held journal connection closes. */
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';

export interface IntentObservationGuard {
 readonly signal:AbortSignal;
 check():void;
}

/** Keep both cancellation sources attached until IndexedDB settles. A guard
 * that ends after the transaction commits cannot undo the committed record. */
export function watchIntentObservation(
 store:PhysicalOperationV3Cancellation,guard:IntentObservationGuard|undefined,abort:()=>void,
):()=>void {
 const stopStore=store.watch(abort);
 if(!guard)return stopStore;
 let operation:PhysicalOperationV3Cancellation|undefined;
 try{
  const active=operation=new PhysicalOperationV3Cancellation(guard.signal);
  const stopOperation=active.watch(abort);
  return ()=>{stopOperation();active.close();stopStore();};
 }catch(error){
  operation?.close();
  stopStore();
  throw error;
 }
}
