import type {RoomActivationIntentChoice,RoomActivationEncodedCapture} from '../../../packages/breditor-collaboration/dist/room_native_activation_intent/contract.js';
import type {RoomHandoverActivationIntentChoice,RoomHandoverActivationEncodedCapture,RoomHandoverActivationRetainedIntent} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/contract.js';
import type {RoomHandoverActivationIntentStore} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/store.js';
import {prepareHandoverActivationReassociation,resumeHandoverActivationReassociation} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/reassociate.js';
import type {PrepareHandoverActivationReassociationInput} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/reassociate.js';
import type {SharedArchiveIntegrityOptions} from '../../../packages/breditor-collaboration/dist/archive_integrity/contract.js';
declare const old:RoomActivationIntentChoice,legacy:RoomActivationEncodedCapture,next:RoomHandoverActivationIntentChoice,store:RoomHandoverActivationIntentStore,encoded:RoomHandoverActivationEncodedCapture;
const retained:Promise<RoomHandoverActivationRetainedIntent>=store.open(encoded);
void retained;void next.handover.path.seal;
// @ts-expect-error The original choice has no selected sealed lineage.
const wrong:RoomHandoverActivationIntentChoice=old;
// @ts-expect-error Original V1 encoded captures cannot initialize a handover intent.
store.open(legacy);
void wrong;

declare const preparation:PrepareHandoverActivationReassociationInput,options:SharedArchiveIntegrityOptions;
const associated:Promise<RoomHandoverActivationIntentChoice>=prepareHandoverActivationReassociation(preparation,options);
void associated;
resumeHandoverActivationReassociation({previous:next,expected:next},options);
// @ts-expect-error A reassociation cannot read an ordinary activation namespace.
resumeHandoverActivationReassociation({previous:old,expected:next},options);
// @ts-expect-error Only the selected previous store supplies graph bytes.
prepareHandoverActivationReassociation({...preparation,encoded},options);
// @ts-expect-error A caller cannot carry a receipt or readiness into a new selection.
resumeHandoverActivationReassociation({previous:next,expected:next,receipt:null},options);
