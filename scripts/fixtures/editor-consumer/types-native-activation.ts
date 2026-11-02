/** Strict API checks run unchanged against source output and installed packages. */
import {SharedDurableNativeActivationHost,SharedNativeActivationError,
 type SharedDurableNativeActivationSelection,type SharedDurableNativeActivationReceipt,
 type RoomActivationIntentChoice,type RoomActivationRetainedIntent} from '../../../packages/breditor-collaboration/dist/index.js';
import type {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import type {ServerPacketRecoveryInput} from '../../../packages/breditor-collaboration/dist/server_packet_recovery/contract.js';
import type {SharedServerLogGenerationRecoveryHost} from '../../../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
declare const owner:SelectedLocalMetadataDelivery,expected:SharedDurableNativeActivationSelection;
declare const recovery:ServerPacketRecoveryInput,inspection:SharedServerLogGenerationRecoveryHost;
const activation=SharedDurableNativeActivationHost.configure({endpoint:'https://example.test/recovery/native-activation/v1/commit',expected,principal:'operator',getToken:()=> 'current-token',checkAuthority(){}});
const receipt:Promise<SharedDurableNativeActivationReceipt>=activation.commit();
const choice:Promise<RoomActivationIntentChoice>=owner.prepareNativeActivation({database:'independently-selected-intent',recovery,selectActivation:()=>activation,retainChoice(choice){void choice.graph.sha256;}});
async function useIntent(expected:RoomActivationIntentChoice){
 const data:RoomActivationRetainedIntent=await owner.readNativeActivationIntent(expected);
 const result=await owner.commitNativeActivation({expected,activation,inspection,approve:()=>true});
 const scope:'held-client-metadata-upload-cut-and-actual-native-service'=result.scope;
 void data.capture;void scope;
}
// @ts-expect-error Native operator authentication is mandatory even for a repeat.
SharedDurableNativeActivationHost.configure({endpoint:'https://example.test/recovery/native-activation/v1/commit',expected,principal:'operator',checkAuthority(){}});
// @ts-expect-error A saved intent does not provide the fresh Native inspector.
owner.commitNativeActivation({expected:await choice,activation,approve:()=>true});
declare const error:SharedNativeActivationError;
void error.code;void receipt;void useIntent;
