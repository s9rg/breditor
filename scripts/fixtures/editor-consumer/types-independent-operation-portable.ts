/** A selected file digest proves data identity, never an old public restore or write permission. */
import type * as Public from '@breditor/collaboration';
import {captureSharedIndependentDeliveryParticipant,SharedIndependentDeliveryParticipantBackup,SharedIndependentDeliveryParticipantRecovery,SharedIndependentDeliverySession} from '@breditor/collaboration';
// @ts-expect-error The new portable family stays private until its complete restore/owner path exists.
type PrivateArchive=Public.IndependentOperationBackup;
// @ts-expect-error Read capture is not added to the package root by implementing internal modules.
type PrivateCapture=typeof Public.captureIndependentOperationBackup;
declare const capture:Parameters<typeof captureSharedIndependentDeliveryParticipant>[0];
// @ts-expect-error An old complete exporter must not silently omit original/current/pending state.
void captureSharedIndependentDeliveryParticipant({...capture,operation:{ready:true}});
declare const oldSelection:Parameters<typeof SharedIndependentDeliveryParticipantBackup.read>[1];
// @ts-expect-error A manifest digest is not the old whole-file selection hash.
const manifestAsOld:typeof oldSelection={original:oldSelection,manifestSha256:'0'.repeat(64)};
declare const recovery:Parameters<typeof SharedIndependentDeliveryParticipantRecovery.resume>[0];
// @ts-expect-error Retained portable metadata cannot select a new owner or grant current permission.
void SharedIndependentDeliveryParticipantRecovery.resume({...recovery,portableOperation:{ready:true}});
declare const source:Parameters<typeof SharedIndependentDeliverySession.open>[0];
// @ts-expect-error Readable operation data cannot select a storage writer through a public flag.
void SharedIndependentDeliverySession.open({...source,readCapability:{prepare(){}}});
