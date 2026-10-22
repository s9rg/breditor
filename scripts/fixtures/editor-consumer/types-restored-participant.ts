/** Parent/source/upload ownership stays private until complete follow-on export exists. */
import * as Public from'@breditor/collaboration';import{SharedIndependentDeliverySession,SharedIndependentDeliveryParticipantRecovery}from'@breditor/collaboration';
// @ts-expect-error A ready object cannot manufacture the new actual whole coordinator.
type Parent=Public.RestoredOperationParticipant;
declare const source:Parameters<typeof SharedIndependentDeliverySession.open>[0];
// @ts-expect-error Names are not an actual source/journal selector or a current grant.
void SharedIndependentDeliverySession.open({...source,cohort:{coordinatorDatabase:'parent',uploadsDatabase:'uploads'}});
declare const old:Parameters<typeof SharedIndependentDeliveryParticipantRecovery.resume>[0];
// @ts-expect-error Original recovery cannot silently accept the new whole-input family.
void SharedIndependentDeliveryParticipantRecovery.resume({...old,kind:'snapshot-v1',journalDatabase:'journal'});
