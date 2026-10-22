import {SharedIndependentHistoryPersistentSession,type SharedIndependentHistorySessionOptions} from '@breditor/collaboration';
// @ts-expect-error A distinct restored-local owner is not a root API promotion.
import {RestoredLocalOperationJournal} from '@breditor/collaboration';
// @ts-expect-error A literal archive does not mint a writable source capability.
import {DetachedRestoredLocalInput} from '@breditor/collaboration';
// @ts-expect-error The restored-local operational opener remains private.
import {openRestoredLocalHistory} from '@breditor/collaboration';
declare const options:SharedIndependentHistorySessionOptions;
// @ts-expect-error Serialized ready/provenance fields cannot select an executable driver.
SharedIndependentHistoryPersistentSession.open({...options,restoredLocalOperation:{ready:true}});
