/** Original V1 intent family; shared custody keeps its schema and byte contract. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {RoomActivationIntentChoice,RoomActivationIntentState,RoomActivationRetainedIntent} from './contract.js';
import {ActivationIntentStore} from './store_engine.js';
import {decodeRoomActivationIntent} from './decode.js';
import {snapshotRoomActivationEncodedCapture} from './snapshot_encoded.js';
import {roomActivationIntentChoice,roomActivationIntentState} from './identity.js';
const codec=Object.freeze({
 choice:roomActivationIntentChoice,snapshot:snapshotRoomActivationEncodedCapture,decode:decodeRoomActivationIntent,state:roomActivationIntentState,
 initial:Object.freeze({format:'breditor/room-native-activation-intent-state',formatVersion:1,revision:0,phase:'prepared',receipt:null} as const),
});
export class RoomActivationIntentStore extends ActivationIntentStore<RoomActivationIntentChoice,RoomActivationRetainedIntent['capture'],RoomActivationIntentState> {
 constructor(choice:RoomActivationIntentChoice,options:SharedArchiveIntegrityOptions){super(choice,options,codec);}
}
