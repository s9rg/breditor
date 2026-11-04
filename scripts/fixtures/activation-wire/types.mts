/** Byte-preserving association returns inert DATA, never a live control. */
import {rebindDecodedRoomActivationIntent} from '../../../packages/breditor-collaboration/dist/room_native_activation_intent/rebind.js';
import {snapshotRoomActivationEncodedCapture} from '../../../packages/breditor-collaboration/dist/room_native_activation_intent/snapshot_encoded.js';
import type {RoomActivationEncodedCapture} from '../../../packages/breditor-collaboration/dist/room_native_activation_intent/contract.js';
import type {ReconciledServerPacketRecoveryCapture} from '../../../packages/breditor-collaboration/dist/reconciled_server_packet_recovery/contract.js';
import type {SharedArchiveIntegrityOptions} from '../../../packages/breditor-collaboration/dist/archive_integrity/contract.js';
import type {SharedDurableNativeActivationSelection} from '../../../packages/breditor-collaboration/dist/native_activation_control/contract.js';
declare const encoded:RoomActivationEncodedCapture,capture:ReconciledServerPacketRecoveryCapture,activation:SharedDurableNativeActivationSelection,options:SharedArchiveIntegrityOptions;
const detached:RoomActivationEncodedCapture=snapshotRoomActivationEncodedCapture(encoded);
const chosen:Promise<RoomActivationEncodedCapture>=rebindDecodedRoomActivationIntent('new-intent',activation,capture,options);
// @ts-expect-error The wire snapshot is immutable.
detached.graph='changed';
// @ts-expect-error The object list is immutable.
detached.objects.push(new Blob());
// @ts-expect-error Encoded bytes are not decoded capture DATA.
void rebindDecodedRoomActivationIntent('new-intent',activation,encoded,options);
void chosen;
