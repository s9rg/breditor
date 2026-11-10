/** The handover choice is detached before IO, independently of the V1 family. */
import {snapshotActivationEncoding} from '../room_native_activation_intent/snapshot_encoding.js';
import {roomHandoverActivationIntentChoice} from './identity.js';
import type {RoomHandoverActivationEncodedCapture} from './contract.js';
export function snapshotRoomHandoverActivationEncodedCapture(input:RoomHandoverActivationEncodedCapture):RoomHandoverActivationEncodedCapture{return snapshotActivationEncoding(input,roomHandoverActivationIntentChoice);}
