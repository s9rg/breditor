import type {RoomActivationIntentChoice,RoomActivationEncodedCapture} from '../../../packages/breditor-collaboration/dist/room_native_activation_intent/contract.js';
import type {RoomHandoverActivationIntentChoice,RoomHandoverActivationEncodedCapture,RoomHandoverActivationRetainedIntent} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/contract.js';
import type {RoomHandoverActivationIntentStore} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/store.js';
import {prepareHandoverActivationReassociation,resumeHandoverActivationReassociation} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/reassociate.js';
import type {PrepareHandoverActivationReassociationInput} from '../../../packages/breditor-collaboration/dist/room_native_handover_activation_intent/reassociate.js';
import type {SharedArchiveIntegrityOptions} from '../../../packages/breditor-collaboration/dist/archive_integrity/contract.js';
import {JointHandoverReassociationIntentStore,JointReassociationIntentStore} from '../../../packages/breditor-collaboration/dist/native_room_joint_reassociation/intent_store.js';
import type {JointHandoverReassociationChoice} from '../../../packages/breditor-collaboration/dist/native_room_joint_reassociation/handover_contract.js';
import type {JointReassociationChoice} from '../../../packages/breditor-collaboration/dist/native_room_joint_reassociation/contract.js';
import {ColdJointRoomActivationAttempt,confirmColdJointHandoverRestart,continueColdJointHandoverRestartMetadata,publishColdJointHandoverRestart} from '../../../packages/breditor-collaboration/dist/native_room_joint_activation/cold_attempt.js';
import type {ColdJointHandoverActivationOptions} from '../../../packages/breditor-collaboration/dist/native_room_joint_activation/cold_contract.js';
import type {HandoverReassociationConfirmationInput} from '../../../packages/breditor-collaboration/dist/native_room_joint_reassociation/handover_confirm.js';
import type {HandoverReassociationPublicationInput} from '../../../packages/breditor-collaboration/dist/native_room_joint_reassociation/handover_publish.js';
import type {SharedNativeRoomPublicationHost} from '../../../packages/breditor-collaboration/dist/native_publication_control/host.js';
import type {HandoverMetadataContinuationResult} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_continuation/handover_contract.js';
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

declare const jointHandover:JointHandoverReassociationChoice,jointOrdinary:JointReassociationChoice;
const joint=new JointHandoverReassociationIntentStore(jointHandover,options);
void joint.open().then(state=>{
 const format:'breditor/joint-native-handover-reassociation-state'=state.format;
 return format;
});
// @ts-expect-error The sealed journal must use a separately selected restart choice.
new JointHandoverReassociationIntentStore(jointOrdinary,options);
// @ts-expect-error The ordinary restart journal cannot take a sealed choice.
new JointReassociationIntentStore(jointHandover,options);

declare const cold:ColdJointHandoverActivationOptions,confirm:HandoverReassociationConfirmationInput;
declare const publication:SharedNativeRoomPublicationHost,publicationInput:HandoverReassociationPublicationInput;
const restart=ColdJointRoomActivationAttempt.resumeSealedRestart(cold);
void confirmColdJointHandoverRestart(restart,jointHandover,confirm);
const {approvePublication,...metadataInput}=publicationInput;
const continuation:Promise<HandoverMetadataContinuationResult>=continueColdJointHandoverRestartMetadata(restart,metadataInput);
void continuation;
void publishColdJointHandoverRestart(restart,publication,{...metadataInput,approvePublication});
// @ts-expect-error The live confirmation must use the selected sealed restart descriptor.
confirmColdJointHandoverRestart(restart,jointOrdinary,confirm);
