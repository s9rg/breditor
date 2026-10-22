/** Immutable provenance is not an old public recovery flag or an operational-source capability. */
import type * as Public from '@breditor/collaboration';
import {SharedIndependentDeliveryParticipantRecovery,captureSharedIndependentDeliveryParticipant,SharedIndependentDeliverySession} from '@breditor/collaboration';
// @ts-expect-error The lineage data family is private until complete restore/handoff is supported.
type Lineage=Public.IndependentOperationLineageBackup;
declare const recovery:Parameters<typeof SharedIndependentDeliveryParticipantRecovery.resume>[0];
// @ts-expect-error A saved graph is not a genuine old recovered owner or its storage selector.
void SharedIndependentDeliveryParticipantRecovery.resume({...recovery,lineage:{ready:true}});
declare const capture:Parameters<typeof captureSharedIndependentDeliveryParticipant>[0];
// @ts-expect-error Old complete exporters cannot silently drop an incoming restore input.
void captureSharedIndependentDeliveryParticipant({...capture,restoreInput:{ready:true}});
declare const source:Parameters<typeof SharedIndependentDeliverySession.open>[0];
// @ts-expect-error Data cannot request adoption of a source or obtain writer custody.
void SharedIndependentDeliverySession.open({...source,lineage:{manifestSha256:'0'.repeat(64)}});
