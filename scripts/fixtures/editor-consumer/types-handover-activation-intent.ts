import type {RoomActivationIntentChoice,RoomActivationEncodedCapture} from '../../../packages/breditor-collaboration/dist/room_native_activation_intent/contract.js';
import type {RoomHandoverActivationIntentChoice,RoomHandoverActivationEncodedCapture,RoomHandoverActivationRetainedIntent} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/contract.js';
import type {RoomHandoverActivationIntentStore} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/store.js';
declare const old:RoomActivationIntentChoice,legacy:RoomActivationEncodedCapture,next:RoomHandoverActivationIntentChoice,store:RoomHandoverActivationIntentStore,encoded:RoomHandoverActivationEncodedCapture;
const retained:Promise<RoomHandoverActivationRetainedIntent>=store.open(encoded);
void retained;void next.handover.path.seal;
// @ts-expect-error The original choice has no selected sealed lineage.
const wrong:RoomHandoverActivationIntentChoice=old;
// @ts-expect-error Original V1 encoded captures cannot initialize a handover intent.
store.open(legacy);
void wrong;
