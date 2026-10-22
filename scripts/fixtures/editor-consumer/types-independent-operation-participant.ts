/** The new full-owner family is private; existing formats and public constructors stay closed. */
import type * as Public from '@breditor/collaboration';
import {SharedIndependentDeliverySession,captureSharedIndependentDeliveryParticipant,SharedIndependentDeliveryParticipantRecovery} from '@breditor/collaboration';
// @ts-expect-error Full operation custody is not a public API merely because the implementation exists.
type PrivateParticipant=Public.OperationalIndependentDeliveryParticipant;
declare const source:Parameters<typeof SharedIndependentDeliverySession.open>[0];
// @ts-expect-error A marker cannot select the private operation storage driver.
void SharedIndependentDeliverySession.open({...source,operation:{ready:true}});
declare const capture:Parameters<typeof captureSharedIndependentDeliveryParticipant>[0];
// @ts-expect-error Old complete codecs cannot claim an operation-journal export.
void captureSharedIndependentDeliveryParticipant({...capture,operation:{ready:true}});
declare const recovery:Parameters<typeof SharedIndependentDeliveryParticipantRecovery.resume>[0];
// @ts-expect-error An old recovery cannot be resumed as an operational source via a serialized flag.
void SharedIndependentDeliveryParticipantRecovery.resume({...recovery,operational:true});
