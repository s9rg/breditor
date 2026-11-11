/** A saved handover intent is DATA. Inspect exact current clients and Native
 * bytes, reauthenticate the path and require a fresh decision for every attempt. */
import {nativeActivationHostPort} from '../native_activation_control/host.js';
import type {SharedDurableNativeActivationHost} from '../native_activation_control/host.js';
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import type {SharedServerLogGenerationDeliveryPathRecoveryHost} from '../generation_delivery_path_control/host.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {HandoverReconciledServerPacketRecoveryCapture} from '../metadata_packet_retention/handover_input.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {activationFailure} from '../native_activation_control/policy.js';
import {fail} from '../room_native_activation_intent/policy.js';
import {RoomHandoverActivationIntentStore} from './store.js';
import {heldHandoverActivationPath} from './path.js';
import type {RoomHandoverActivationIntentChoice,RoomHandoverActivationRetainedIntent} from './contract.js';
export interface RoomHandoverActivationCommitPolicy {
 readonly expected:RoomHandoverActivationIntentChoice;
 readonly activation:SharedDurableNativeActivationHost;
 readonly path:SharedServerLogGenerationDeliveryPathRecoveryHost;
 readonly approve:(choice:RoomHandoverActivationIntentChoice)=>boolean|Promise<boolean>;
}
export interface RoomHandoverActivationCommitResult {
 readonly format:'breditor/coordinated-handover-native-activation-result';readonly formatVersion:1;
 readonly scope:'held-client-metadata-upload-cut-sealed-handover-and-actual-native-service';
 readonly intent:RoomHandoverActivationIntentChoice;
 readonly receipt:SharedDurableNativeActivationReceipt;
}
export async function commitHeldHandoverRoomActivation(policy:RoomHandoverActivationCommitPolicy,options:SharedArchiveIntegrityOptions,check:()=>void,inspectExact:(capture:HandoverReconciledServerPacketRecoveryCapture)=>Promise<void>):Promise<RoomHandoverActivationCommitResult>{
 const activation=nativeActivationHostPort(policy.activation),path=heldHandoverActivationPath(policy.path,policy.expected.handover);
 if(JSON.stringify(activation.selection)!==JSON.stringify(policy.expected.activation))throw fail('activation_intent_stale');
 const guard=()=>{check();activation.check();path.guard(options.signal);check();};
 const lifetime=new NativeReconstructionWaits(guard,[options.signal,...activation.signals,...path.signals]);
 let store:RoomHandoverActivationIntentStore|undefined;
 let started=false,failed=false,error:unknown,result:RoomHandoverActivationCommitResult|undefined;
 const heldCheck=()=>{store!.check();lifetime.check();};
 try{
  store=new RoomHandoverActivationIntentStore(policy.expected,{wasm:options.wasm,checkAuthority:lifetime.check,signal:lifetime.signal});
  const retained=await store.open();heldCheck();
  await path.check(lifetime.signal);heldCheck();await inspectExact(retained.capture);heldCheck();
  const approval=new NativeReconstructionWaits(heldCheck,[lifetime.signal,store.revoked]);
  try{if(await approval.call(()=>policy.approve(policy.expected))!==true)throw fail('activation_intent_policy');}
  catch(cause){if(store.revoked.aborted)store.check();throw cause;}finally{approval.close();}
  await path.check(lifetime.signal);heldCheck();await inspectExact(retained.capture);heldCheck();
  // From here every failure conservatively retains the attempted outcome.
  started=true;await store.markRequestStarted(lifetime);heldCheck();
  await path.check(lifetime.signal);heldCheck();
  const receipt=await activation.commit(heldCheck,lifetime.signal);heldCheck();
  await path.check(lifetime.signal);heldCheck();
  await store.markReceiptObserved(receipt,lifetime);heldCheck();
  result=Object.freeze({format:'breditor/coordinated-handover-native-activation-result',formatVersion:1,scope:'held-client-metadata-upload-cut-sealed-handover-and-actual-native-service',intent:policy.expected,receipt});heldCheck();
 }catch(cause){failed=true;error=cause;}
 try{await store?.close();}catch(cause){if(!failed)error=cause;failed=true;}finally{lifetime.close();}
 if(failed)throw started?activationFailure('activation_outcome_unknown',error):error;
 if(!result)throw fail();return result;
}
/** Complete existing-only read; no path declaration or receipt becomes a grant. */
export async function readHeldHandoverRoomActivation(expected:RoomHandoverActivationIntentChoice,options:SharedArchiveIntegrityOptions):Promise<RoomHandoverActivationRetainedIntent>{
 const store=new RoomHandoverActivationIntentStore(expected,options);try{return await store.open();}finally{await store.close();}
}
