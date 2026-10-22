import {SharedIndependentParticipantBackup,SharedIndependentHistoryPersistentSession,type SharedIndependentParticipantSelection,type SharedIndependentHistorySessionOptions} from '@breditor/collaboration';
// @ts-expect-error Portable local operations remain a private distinct format family.
import {IndependentLocalOperationBackup} from '@breditor/collaboration';
// @ts-expect-error A raw local source does not acquire operational provenance by root import.
import {captureLocalOperationBackup} from '@breditor/collaboration';
declare const file:Blob,original:SharedIndependentParticipantSelection,source:SharedIndependentHistorySessionOptions;
SharedIndependentParticipantBackup.read(file,original);
// @ts-expect-error A new manifest selection is not the old complete-local whole-file selection.
SharedIndependentParticipantBackup.read(file,{original,manifestSha256:'0'.repeat(64)});
// @ts-expect-error Serialized incoming data cannot select an executable operation source owner.
SharedIndependentHistoryPersistentSession.open({...source,portableOperation:{ready:true,file}});
