import {SharedIndependentParticipantRecovery,SharedIndependentHistoryPersistentSession,type SharedIndependentParticipantRecoveryOptions,type SharedIndependentHistorySessionOptions} from '@breditor/collaboration';
// @ts-expect-error Complete local operational ownership is still a private genuine-owner contract.
import {OperationalIndependentLocalParticipant} from '@breditor/collaboration';
// @ts-expect-error Serialized fields cannot issue a parent namespace delegation.
import {LocalOperationParticipantOpening} from '@breditor/collaboration';
// @ts-expect-error A child opening receipt is not a public ready/activation grant.
import {localParticipantJournalOpening} from '@breditor/collaboration';
declare const recovery:SharedIndependentParticipantRecoveryOptions,source:SharedIndependentHistorySessionOptions;
SharedIndependentParticipantRecovery.begin(recovery);
// @ts-expect-error Old complete local recovery is not upgraded by an operational flag.
SharedIndependentParticipantRecovery.begin({...recovery,operational:true});
// @ts-expect-error The ordinary public source opener cannot select participant storage.
SharedIndependentHistoryPersistentSession.open({...source,participant:{phase:'operational'}});
