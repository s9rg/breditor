import {SharedIndependentHistoryPersistentSession,type SharedIndependentHistorySessionOptions,type SharedIndependentHistoryRecovery} from '@breditor/collaboration';
// @ts-expect-error A local operation journal is an actual private owner, not a public ready DTO.
import {IndependentLocalOperationCutJournal} from '@breditor/collaboration';
// @ts-expect-error The journaled source opener is not a completed public participant API.
import {openJournaledIndependentLocalHistory} from '@breditor/collaboration';
// @ts-expect-error Fresh read custody is a private genuine-journal capability.
import {localOperationJournalBinding} from '@breditor/collaboration';
declare const options:SharedIndependentHistorySessionOptions,recovery:SharedIndependentHistoryRecovery;
SharedIndependentHistoryPersistentSession.open(options);
SharedIndependentHistoryPersistentSession.restoreRecovery(options,recovery,'host-reacquired');
// @ts-expect-error Public options cannot select a private local storage driver.
SharedIndependentHistoryPersistentSession.open({...options,localJournal:{ready:true}});
// @ts-expect-error Serialized storage names are not permission to change source families.
SharedIndependentHistoryPersistentSession.open({...options,storage:'local-operation-v1'});
