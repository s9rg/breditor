/** New restore ownership stays private until the complete participant/export contract exists. */
import * as Public from '@breditor/collaboration';
import{SharedIndependentDeliverySession,SharedIndependentDeliveryParticipantRecovery}from'@breditor/collaboration';
// @ts-expect-error A genuine private restored journal cannot be manufactured publicly.
type Journal=Public.RestoredOperationJournal;
// @ts-expect-error Source-only restore is not a public complete participant factory.
void Public.openRestoredOperationSource;
declare const source:Parameters<typeof SharedIndependentDeliverySession.open>[0];
// @ts-expect-error Serialized fields cannot select the new storage family.
void SharedIndependentDeliverySession.open({...source,storage:'restored-operation-v1'});
declare const recovery:Parameters<typeof SharedIndependentDeliveryParticipantRecovery.resume>[0];
// @ts-expect-error Old recovery must not silently reinterpret a new operational input.
void SharedIndependentDeliveryParticipantRecovery.resume({...recovery,restoreInput:{kind:'snapshot-v1'}});
