/** Associate complete local/server bytes with the exact selected native target.
 * Recomputed associations remain DATA; actual source and server custody checks
 * still run before the request. Neither supplied Ready flags nor saved receipts substitute. */
import {composeReconciledServerPacketRecovery} from '../reconciled_server_packet_recovery/compose.js';
import type {ReconciledServerPacketRecoveryCapture} from '../reconciled_server_packet_recovery/contract.js';
import type {SharedDurableNativeActivationSelection} from '../native_activation_control/contract.js';
import {fail} from './policy.js';
export function assertRoomActivationCapture(activation:SharedDurableNativeActivationSelection,capture:ReconciledServerPacketRecoveryCapture):void {
 const actual=composeReconciledServerPacketRecovery(capture.recovery,capture.reconciliation),original=capture.recovery.bundle.original;
 if(JSON.stringify(actual.binding)!==JSON.stringify(capture.binding)
  ||JSON.stringify(activation.current)!==JSON.stringify(capture.reconciliation.sources.native.selection.source)
  ||JSON.stringify(activation.current.server)!==JSON.stringify(original.server.identity)
  ||JSON.stringify(activation.current.participants)!==JSON.stringify(original.inventory.identity))throw fail('activation_intent_stale');
}
