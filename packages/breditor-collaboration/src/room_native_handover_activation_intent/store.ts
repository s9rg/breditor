/** Atomic absent-only retention with complete byte validation on every reopen.
 * Original V1 namespaces and data are never rewritten into this family. */
import {ActivationIntentStore} from '../room_native_activation_intent/store_engine.js';
import {roomHandoverActivationIntentChoice,roomHandoverActivationIntentState} from './identity.js';
import {decodeRoomHandoverActivationIntent} from './decode.js';
import {snapshotRoomHandoverActivationEncodedCapture} from './snapshot_encoded.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {RoomHandoverActivationIntentChoice,RoomHandoverActivationIntentState,RoomHandoverActivationRetainedIntent} from './contract.js';
const codec=Object.freeze({
 choice:roomHandoverActivationIntentChoice,snapshot:snapshotRoomHandoverActivationEncodedCapture,decode:decodeRoomHandoverActivationIntent,state:roomHandoverActivationIntentState,
 initial:Object.freeze({format:'breditor/room-native-handover-activation-intent-state',formatVersion:1,revision:0,phase:'prepared',receipt:null} as const),
});
export class RoomHandoverActivationIntentStore extends ActivationIntentStore<RoomHandoverActivationIntentChoice,RoomHandoverActivationRetainedIntent['capture'],RoomHandoverActivationIntentState>{
 constructor(choice:RoomHandoverActivationIntentChoice,options:SharedArchiveIntegrityOptions){super(choice,options,codec);}
 /** Existing-only exact bytes for a separately selected restart association. */
 openRetainedEncoding(){return this.openWithEncoding();}
}
