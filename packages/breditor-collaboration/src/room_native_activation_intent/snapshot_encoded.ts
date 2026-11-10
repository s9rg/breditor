/** Detach only the original V1 choice before any asynchronous byte validation. */
import {roomActivationIntentChoice} from './identity.js';
import {snapshotActivationEncoding} from './snapshot_encoding.js';
import type {RoomActivationEncodedCapture} from './contract.js';
export function snapshotRoomActivationEncodedCapture(input:RoomActivationEncodedCapture):RoomActivationEncodedCapture{return snapshotActivationEncoding(input,roomActivationIntentChoice);}
