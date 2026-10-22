/** New graph internals do not freeze a public API or widen old source factories. */
import*as Public from'@breditor/collaboration';import{SharedIndependentDeliverySession,SharedIndependentDeliveryParticipantRecovery}from'@breditor/collaboration';
// @ts-expect-error A data object cannot manufacture the private actual graph archive.
type Graph=Public.RestoredOperationGraphArchive;
// @ts-expect-error The private capture is not a promoted root API.
void Public.captureRestoredGraph;
declare const source:Parameters<typeof SharedIndependentDeliverySession.open>[0];
// @ts-expect-error A serialized graph kind/ready flag cannot select a writable source owner.
void SharedIndependentDeliverySession.open({...source,kind:'lineage-v2',ready:true});
declare const old:Parameters<typeof SharedIndependentDeliveryParticipantRecovery.resume>[0];
// @ts-expect-error The old complete recovery does not silently reinterpret a graph archive.
void SharedIndependentDeliveryParticipantRecovery.resume({...old,kind:'lineage-v2',graph:{ready:true}});
