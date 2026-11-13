/** Original V1 intent family; shared custody keeps its schema and byte contract. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {RoomActivationIntentChoice,RoomActivationIntentState,RoomActivationRetainedIntent} from './contract.js';
import {ActivationIntentStore} from './store_engine.js';
import {decodeRoomActivationIntent} from './decode.js';
import {snapshotRoomActivationEncodedCapture} from './snapshot_encoded.js';
import {roomActivationIntentChoice,roomActivationIntentState} from './identity.js';
import {nativeActivationReceipt} from '../native_activation_control/identity.js';
import type {ActivationIntentStoreCodec} from './store_contract.js';
const codec:ActivationIntentStoreCodec<RoomActivationIntentChoice,RoomActivationRetainedIntent['capture'],RoomActivationIntentState>={
 choice:roomActivationIntentChoice,snapshot:snapshotRoomActivationEncodedCapture,decode:decodeRoomActivationIntent,state:roomActivationIntentState,
 initial:Object.freeze({format:'breditor/room-native-activation-intent-state',formatVersion:1,revision:0,phase:'prepared',receipt:null} as const),
 receipt:(receipt,choice)=>nativeActivationReceipt(JSON.stringify(receipt),choice.activation),
};
export class RoomActivationIntentStore extends ActivationIntentStore<RoomActivationIntentChoice,RoomActivationRetainedIntent['capture'],RoomActivationIntentState> {
 constructor(choice:RoomActivationIntentChoice,options:SharedArchiveIntegrityOptions){super(choice,options,codec);}
}
