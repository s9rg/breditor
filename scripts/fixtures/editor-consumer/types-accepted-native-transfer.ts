/** Explicit accepted server payloads do not supply native custody or activation. */
import * as api from '@breditor/collaboration';
declare const host:api.SharedPhysicalRoomRecoveryHost,read:api.SharedPhysicalRecoveryAcceptedRead;
const request:api.SharedPhysicalRecoveryAcceptedRequest={document:'include',review:{kind:'start'}};
const result:Promise<api.SharedPhysicalRecoveryAcceptedRead>=host.readAcceptedNative(request);void result;
// @ts-expect-error No implicit/default document selection.
host.readAcceptedNative({review:{kind:'start'}});
// @ts-expect-error Continuation must have its exact native cursor.
host.readAcceptedNative({document:'omit',review:{kind:'after'}});
// @ts-expect-error A result cannot activate the server or a client.
read.activate();
// @ts-expect-error The result owns no mutable native clients.
read.clients;
// @ts-expect-error Historical native receipts are immutable, not new acknowledgements.
read.review!.batches[0]!.receipt.through='0';
// @ts-expect-error No current recipient permission can be assigned through a read.
read.review!.currentRole='moderator';
// @ts-expect-error Snapshot data is not a live authenticated host.
const forged:api.SharedPhysicalRoomRecoveryHost=read;void forged;
