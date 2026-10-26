/** Conservative continuation of already-admitted delivery records. Native
 * ancestry and relay progress are checked separately. Only additional complete
 * rows are automatic: changing/forgetting an existing intent, receipt, decision
 * or catalog requires explicit reconciliation. Nothing is published or ACKed.
 */
import type {SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {verifyRetainedReconstructionPackets} from './retained_packets.js';
export function verifyDeliveryReconstructionPackets(before:SharedIndependentDeliveryRecovery,after:SharedIndependentDeliveryRecovery):void{
 verifyRetainedReconstructionPackets(before,after);
}
