/** Complete participant/source contracts are distinct from old local-only/generation and live authority. */
import {SharedIndependentDeliverySession,SharedIndependentHistoryPersistentSession,SharedIndependentDeliverySourceCapture,SharedIndependentDeliveryParticipantBackup,captureSharedIndependentDeliverySource,captureSharedIndependentDeliveryParticipant,captureSharedIndependentSource,readSharedIndependentDeliveryParticipant,type SharedIndependentDeliveryOptions,type SharedIndependentDeliveryRecovery,type SharedIndependentDeliveryParticipantSelection,type SharedIndependentDeliverySourceRecord} from '@breditor/collaboration';
import type {RichAssetStore} from '@breditor/experimental-rich-content';
declare const session:SharedIndependentDeliverySession<'document-v1'>,options:SharedIndependentDeliveryOptions<'document-v1'>,uploads:RichAssetStore,file:Blob;
const source=captureSharedIndependentDeliverySource({session}),metadata=source.metadata(),records:readonly SharedIndependentDeliverySourceRecord[]=source.records();source.check();void records;
metadata.identity.history.native.selectionEditing;metadata.identity.binding.document.writer;metadata.identity.retained.suggestions;
const result=await captureSharedIndependentDeliveryParticipant({participant:'desktop',principal:'alice',source:{session},assets:uploads,checkAuthority(){}});
if(result.kind==='ready'){const archive=result.backup,recovery:SharedIndependentDeliveryRecovery=archive.sourceRecovery(),selection:SharedIndependentDeliveryParticipantSelection=archive.selection();archive.verifySource(source);await archive.verifyRecovered(source,uploads);archive.uploadEntries();archive.uploadBlob('sha256:asset');archive.blob('asset','generation');const restored=await SharedIndependentDeliverySession.restoreRecovery({...options,database:'absent-source',recovery,writerRecovery:'host-reacquired'});void restored;await readSharedIndependentDeliveryParticipant(file,selection);archive.dispose();}
// @ts-expect-error a complete delivery owner is not a local-only independent capture
captureSharedIndependentSource({session});
// @ts-expect-error a local-only owner cannot supply receipts or all retained work by shape
captureSharedIndependentDeliverySource({session:await SharedIndependentHistoryPersistentSession.open(options)});
// @ts-expect-error no raw core/writer custody escapes a read-only capture
source.core;
// @ts-expect-error historical identity does not carry current comment authority
metadata.identity.history.review.access;
// @ts-expect-error metadata cannot supply a saved secret credential
metadata.identity.binding.document.credential;
// @ts-expect-error a selection requires exact independent source history and delivery bindings
await readSharedIndependentDeliveryParticipant(file,{identity:{participant:'desktop',principal:'alice',source:{},assets:'whole-store'},sha256:'0'.repeat(64)});
// @ts-expect-error native actual constructors use genuine private runtime admission
new SharedIndependentDeliverySourceCapture();
// @ts-expect-error archive checksums cannot be minted into a genuine participant by construction
new SharedIndependentDeliveryParticipantBackup();
// @ts-expect-error archive capture requires current explicit host authority
await captureSharedIndependentDeliveryParticipant({participant:'desktop',principal:'alice',source:{session},assets:uploads});
// @ts-expect-error private read ports are not package-root API
import {independentDeliverySourceSnapshot,registerIndependentDeliverySource} from '@breditor/collaboration';void independentDeliverySourceSnapshot;void registerIndependentDeliverySource;
