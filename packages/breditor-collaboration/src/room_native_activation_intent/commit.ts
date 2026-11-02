/** Advisory records never authorize activation. Recheck genuine held source and server every time. */
import {nativeActivationHostPort,type SharedDurableNativeActivationHost} from '../native_activation_control/host.js';
import {activationFailure} from '../native_activation_control/policy.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import type {ReconciledServerPacketRecoveryCapture} from '../reconciled_server_packet_recovery/contract.js';
import type {RoomActivationIntentChoice,RoomActivationRetainedIntent} from './contract.js';
import {RoomActivationIntentStore} from './store.js';
import {fail} from './policy.js';
export interface RoomActivationCommitPolicy {
 readonly expected:RoomActivationIntentChoice;
 readonly activation:SharedDurableNativeActivationHost;
 readonly approve:(choice:RoomActivationIntentChoice)=>boolean|Promise<boolean>;
}
export interface RoomActivationCommitResult {
 readonly format:'breditor/coordinated-native-activation-result';readonly formatVersion:1;
 readonly scope:'held-client-metadata-upload-cut-and-actual-native-service';
 readonly intent:RoomActivationIntentChoice;
 readonly receipt:SharedDurableNativeActivationReceipt;
}
export async function commitHeldRoomActivation(policy:RoomActivationCommitPolicy,options:SharedArchiveIntegrityOptions,check:()=>void,inspectExact:(capture:ReconciledServerPacketRecoveryCapture)=>Promise<void>):Promise<RoomActivationCommitResult>{
 const port=nativeActivationHostPort(policy.activation);check();port.check();check();
 if(JSON.stringify(port.selection)!==JSON.stringify(policy.expected.activation))throw fail('activation_intent_stale');
 const store=new RoomActivationIntentStore(policy.expected,options);let started=false,failed=false,result:RoomActivationCommitResult|undefined,error:unknown;
 try{
  const retained=await store.open();check();await inspectExact(retained.capture);check();
  if(await policy.approve(policy.expected)!==true)throw fail('activation_intent_policy');port.check();check();
  // Approval can run application code. Re-admit exact Native/metadata/upload
  // state after it, before recording the possibly irreversible attempt.
  await inspectExact(retained.capture);check();started=true;
  await store.markRequestStarted();check();
  const heldCheck=()=>{store.check();check();};
  const receipt=await port.commit(heldCheck,options.signal);heldCheck();
  await store.markReceiptObserved(receipt);heldCheck();
  result=Object.freeze({format:'breditor/coordinated-native-activation-result',formatVersion:1,scope:'held-client-metadata-upload-cut-and-actual-native-service',intent:policy.expected,receipt});heldCheck();
 }catch(cause){failed=true;error=cause;}
 try{await store.close();}catch(cause){if(!failed)error=cause;failed=true;}
 if(failed)throw started?activationFailure('activation_outcome_unknown'):error;
 if(!result)throw fail();return result;
}
/** Cold read is DATA only. Native inspection and actual source equality are
 * still required by commit; a saved receipt never reissues a live service. */
export async function readHeldRoomActivation(expected:RoomActivationIntentChoice,options:SharedArchiveIntegrityOptions):Promise<RoomActivationRetainedIntent>{
 const store=new RoomActivationIntentStore(expected,options);try{return await store.open();}finally{await store.close();}
}
