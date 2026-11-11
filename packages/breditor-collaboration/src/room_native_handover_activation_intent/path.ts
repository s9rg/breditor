/** Genuine selected path plus its full controller lifetime. Detached handover
 * declarations never supply this guard or an authenticated Native read. */
import {generationDeliveryPathRecoveryHostPort} from '../generation_delivery_path_control/host.js';
import type {SharedServerLogGenerationDeliveryPathRecoveryHost} from '../generation_delivery_path_control/host.js';
import type {SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection} from '../generation_delivery_path_control/handover.js';
import {fail} from '../room_native_activation_intent/policy.js';
export function heldHandoverActivationPath(host:SharedServerLogGenerationDeliveryPathRecoveryHost,expected?:SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection){
 const port=generationDeliveryPathRecoveryHostPort(host);
 if(!port.handover||expected&&JSON.stringify(port.handover)!==JSON.stringify(expected))throw fail('activation_intent_stale');
 return Object.freeze({selection:port.handover,signals:port.signals,guard:(signal?:AbortSignal)=>port.guard(signal),check:(signal?:AbortSignal)=>port.check(signal)});
}
