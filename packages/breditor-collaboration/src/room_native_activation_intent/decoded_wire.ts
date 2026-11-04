/** Immutable wire DATA retained by a completed decoder. This is neither a
 * live source nor a Native grant. A logical copy cannot recover byte identity
 * that is absent from its values (graph-header order and Blob index order). */
import type {ReconciledServerPacketRecoveryCapture} from '../reconciled_server_packet_recovery/contract.js';
import type {RoomActivationEncodedCapture} from './contract.js';
const wires=new WeakMap<object,RoomActivationEncodedCapture>();
/** SDK decoder only, after every hash, shape, binding and authority check. */
export function rememberDecodedActivationWire(capture:ReconciledServerPacketRecoveryCapture,wire:RoomActivationEncodedCapture):void{
 wires.set(capture,Object.freeze({choice:wire.choice,graph:wire.graph,objects:Object.freeze(wire.objects.map(file=>Object.freeze(file)))}));
}
/** Byte provenance only. It supplies no owner, current receipt or permission. */
export function decodedActivationWire(capture:ReconciledServerPacketRecoveryCapture):RoomActivationEncodedCapture|undefined{return wires.get(capture);}
