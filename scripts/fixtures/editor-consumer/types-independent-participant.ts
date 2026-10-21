/** Exact local history family and native source proof remain explicit at the public package boundary. */
import {SharedIndependentSourceCapture,SharedIndependentParticipantBackup,captureSharedIndependentSource,captureSharedIndependentParticipant,readSharedIndependentParticipant,SharedIndependentHistoryPersistentSession,type SharedIndependentSourceSelection,type SharedIndependentSourceRecord,type SharedIndependentParticipantCaptureOptions,type SharedIndependentParticipantSelection,type SharedIndependentHistoryRecovery} from '@breditor/collaboration';
import type {RichAssetStore} from '@breditor/experimental-rich-content';
declare const session:SharedIndependentHistoryPersistentSession<'document-v1'>,assets:RichAssetStore,file:Blob,selection:SharedIndependentParticipantSelection;
const chosen:SharedIndependentSourceSelection<'document-v1'>={session},source:SharedIndependentSourceCapture=captureSharedIndependentSource(chosen);
const records:readonly SharedIndependentSourceRecord[]=source.records();void records;source.check();
const options:SharedIndependentParticipantCaptureOptions<'document-v1'>={participant:'alice-laptop',principal:'alice',source:chosen,assets,checkAuthority(){}};
const result=await captureSharedIndependentParticipant(options);if(result.kind==='ready'){const backup:SharedIndependentParticipantBackup=result.backup,recovery:SharedIndependentHistoryRecovery=backup.sourceRecovery();void recovery;backup.verifySource(source);await backup.verifyRecovered(source,assets);backup.selection().identity.source.reviewHistory;backup.dispose();}
const archive=await readSharedIndependentParticipant(file,selection);archive.uploadEntries();archive.uploadBackup();archive.blob('asset','generation');archive.dispose();source.dispose();
// @ts-expect-error an original/generation family selector is not independent custody
captureSharedIndependentSource({kind:'local',session});
// @ts-expect-error a parsed recovery object is not a genuine live session
captureSharedIndependentSource({session:{core:session.core,exportRecovery:()=>session.exportRecovery()}});
// @ts-expect-error a current authority check is mandatory, not recovered from the selected identity
await captureSharedIndependentParticipant({participant:'alice-laptop',principal:'alice',source:chosen,assets});
// @ts-expect-error archive digest and exact historical identity must be selected explicitly
await readSharedIndependentParticipant(file);
// @ts-expect-error saved source identity never includes current grants
selection.identity.source.review.access='moderate';
// @ts-expect-error genuine persistence owners are created through their checked factories, never public construction
new SharedIndependentHistoryPersistentSession();
