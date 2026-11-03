import {retainActivationChoice} from './retain_choice.js';
/** Retain complete source data and an independent choice before any commit request. */
import {nativeActivationHostPort,type SharedDurableNativeActivationHost} from '../native_activation_control/host.js';
import type {SharedServerLogGenerationRecoveryIdentity} from '../generation_recovery_control/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {ReconciledServerPacketRecoveryCapture} from '../reconciled_server_packet_recovery/contract.js';
import {encodeRoomActivationIntent} from './encode.js';
import {RoomActivationIntentStore} from './store.js';
import type {RoomActivationIntentChoice} from './contract.js';
import {fail} from './policy.js';
export interface RoomActivationPreparationPolicy {
 readonly database:string;
 /** Trusted host provisioning hook. Select a prepared control, never activate it here. */
 readonly selectActivation:(source:SharedServerLogGenerationRecoveryIdentity)=>SharedDurableNativeActivationHost|Promise<SharedDurableNativeActivationHost>;
 /** Persist this independent choice before the absent-only intent write. */
 readonly retainChoice:(choice:RoomActivationIntentChoice)=>void|Promise<void>;
}
export async function prepareHeldRoomActivation(capture:ReconciledServerPacketRecoveryCapture,policy:RoomActivationPreparationPolicy,options:SharedArchiveIntegrityOptions,check:()=>void):Promise<RoomActivationIntentChoice>{
 check();if(capture.recovery.kind!=='retained'||capture.recovery.bundle.assets.kind!=='retained')throw fail('activation_intent_incomplete');
 const source=capture.reconciliation.sources.native.selection.source,activation=await policy.selectActivation(source);check();const port=nativeActivationHostPort(activation);port.check();check();
 if(JSON.stringify(port.selection.current)!==JSON.stringify(source))throw fail('activation_intent_stale');
 const encoded=await encodeRoomActivationIntent(policy.database,port.selection,capture,options);check();
 await retainActivationChoice(encoded.choice,policy.retainChoice,check,[options.signal]);port.check();check();
 const store=new RoomActivationIntentStore(encoded.choice,options);
 try{const retained=await store.open(encoded);check();if(retained.state.phase!=='prepared')throw fail();return encoded.choice;}finally{await store.close();}
}
