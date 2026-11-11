/** Select saved pins in order. Duplicate cuts require duplicate observations. */
import type {SharedServerLogGenerationRoomBackupIdentity as Cut} from '../server_generation_archive/contract.js';
import type {SharedServerLogGenerationHandoverDeliveryPathIdentity} from './handover.js';

export function containsOrderedDeliveryCuts(path:readonly Cut[],required:readonly Cut[]):boolean {
 let at=0;
 for(const pin of required){
  const expected=JSON.stringify(pin);
  while(at<path.length&&JSON.stringify(path[at])!==expected)at++;
  if(at===path.length)return false;
  at++;
 }
 return true;
}

export function handoverDeliveryCuts(path:SharedServerLogGenerationHandoverDeliveryPathIdentity):readonly Cut[] {
 return [...path.earlier,...path.successor.ancestors];
}

/** Compare durable lineage while allowing fresh controller instances. */
export function continuesSealedDeliveryPath(
 recorded:SharedServerLogGenerationHandoverDeliveryPathIdentity,
 live:SharedServerLogGenerationHandoverDeliveryPathIdentity,
):boolean {
 return JSON.stringify(recorded.seal)===JSON.stringify(live.seal)&&
  JSON.stringify(recorded.earlier)===JSON.stringify(live.earlier)&&
  JSON.stringify(recorded.successor.current)===JSON.stringify(live.successor.current)&&
  containsOrderedDeliveryCuts(live.successor.ancestors,recorded.successor.ancestors);
}
