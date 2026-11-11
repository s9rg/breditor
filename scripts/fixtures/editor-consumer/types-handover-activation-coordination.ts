import type {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import type {PrepareHandoverRoomNativeActivationInput,CommitHandoverRoomNativeActivationInput} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/coordinator_contract.js';
import type {RoomHandoverActivationIntentChoice,RoomHandoverActivationRetainedIntent} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/contract.js';
import type {RoomHandoverActivationCommitResult} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/commit.js';
import type {PrepareRoomNativeActivationInput,CommitRoomNativeActivationInput} from '../../../packages/breditor-collaboration/dist/room_native_activation_intent/coordinator_contract.js';
declare const metadata:SelectedLocalMetadataDelivery,prepare:PrepareHandoverRoomNativeActivationInput,commit:CommitHandoverRoomNativeActivationInput,originalPrepare:PrepareRoomNativeActivationInput,originalCommit:CommitRoomNativeActivationInput,expected:RoomHandoverActivationIntentChoice;
const choice:Promise<RoomHandoverActivationIntentChoice>=metadata.prepareNativeActivationAcrossHandover(prepare);
const read:Promise<RoomHandoverActivationRetainedIntent>=metadata.readNativeHandoverActivationIntent(expected);
const result:Promise<RoomHandoverActivationCommitResult>=metadata.commitNativeActivationAcrossHandover(commit);
void choice;void read;void result;
// @ts-expect-error A separately provisioned inactive control and sealed path are required.
metadata.prepareNativeActivationAcrossHandover(originalPrepare);
// @ts-expect-error Original intents cannot stand in for the explicit handover family.
metadata.commitNativeActivationAcrossHandover(originalCommit);
