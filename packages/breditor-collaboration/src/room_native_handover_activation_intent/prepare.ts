/** The host provisions an inactive target before this operation. Preparation
 * retains its exact choice and all bytes and never requests Native activation. */
import {nativeActivationHostPort} from '../native_activation_control/host.js';
import type {SharedDurableNativeActivationHost} from '../native_activation_control/host.js';
import type {SharedServerLogGenerationDeliveryPathRecoveryHost} from '../generation_delivery_path_control/host.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {HandoverReconciledServerPacketRecoveryCapture} from '../metadata_packet_retention/handover_input.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {retainActivationChoice} from '../room_native_activation_intent/retain_choice.js';
import {encodeRoomHandoverActivationIntent} from './encode.js';
import {RoomHandoverActivationIntentStore} from './store.js';
import {heldHandoverActivationPath} from './path.js';
import type {RoomHandoverActivationIntentChoice} from './contract.js';
import {fail} from '../room_native_activation_intent/policy.js';
export interface RoomHandoverActivationPreparationPolicy {
 readonly database:string;
 readonly activation:SharedDurableNativeActivationHost;
 readonly path:SharedServerLogGenerationDeliveryPathRecoveryHost;
 readonly retainChoice:(choice:RoomHandoverActivationIntentChoice)=>void|Promise<void>;
}
export async function prepareHeldHandoverRoomActivation(capture:HandoverReconciledServerPacketRecoveryCapture,policy:RoomHandoverActivationPreparationPolicy,options:SharedArchiveIntegrityOptions,check:()=>void):Promise<RoomHandoverActivationIntentChoice>{
 const activation=nativeActivationHostPort(policy.activation),path=heldHandoverActivationPath(policy.path);
 const guard=()=>{check();activation.check();path.guard(options.signal);check();};
 const lifetime=new NativeReconstructionWaits(guard,[options.signal,...activation.signals,...path.signals]);
 try{
  lifetime.check();await path.check(lifetime.signal);lifetime.check();
  const held={wasm:options.wasm,checkAuthority:lifetime.check,signal:lifetime.signal};
  const encoded=await encodeRoomHandoverActivationIntent(policy.database,activation.selection,path.selection,capture,held);lifetime.check();
  await retainActivationChoice(encoded.choice,policy.retainChoice,lifetime.check,[lifetime.signal]);lifetime.check();
  await path.check(lifetime.signal);lifetime.check();
  const store=new RoomHandoverActivationIntentStore(encoded.choice,held);
  try{const retained=await store.open(encoded);lifetime.check();if(retained.state.phase!=='prepared')throw fail();return encoded.choice;}finally{await store.close();}
 }finally{lifetime.close();}
}
