/** Original paired snapshots remain deep readonly diagnostic data. */
import * as publicRoot from '@breditor/collaboration';
import {capturePersistentPairedRecords} from '../../../packages/breditor-collaboration/dist/persistence/review_session.js';
import {OriginalPairedRecordRead} from '../../../packages/breditor-collaboration/dist/persistence/paired_record_read.js';
declare const source:publicRoot.SharedReviewPersistentSession<'document-v1'>;
async function pairedRecordReadContract(){
 const read=await capturePersistentPairedRecords(source,()=>{});read.check();await read.verify();read.checkCurrent();const metadata=read.metadata();
 const scope:'original-paired-committed-pending-live'=metadata.scope;void scope;
 // @ts-expect-error A detached report cannot alter document records.
 metadata.live.documentCheckpointJson='forged';
 // @ts-expect-error Immutable version lists cannot be changed.
 metadata.committed.versions.push('forged');
 if('progress'in metadata.live&&metadata.live.progress?.cursor){
  // @ts-expect-error Nested relay cursors are readonly diagnostic values.
  metadata.live.progress.cursor.after='10';
 }
 // @ts-expect-error No editor is exposed by the record reader.
 read.core.undo();
 // @ts-expect-error Record readiness is not a writer or activation grant.
 read.activate();
 // @ts-expect-error No transfer of source ownership occurs.
 read.intoParts();
 // @ts-expect-error Only the genuine source reader constructs these handles.
 new OriginalPairedRecordRead({},metadata,{});
 // @ts-expect-error Independent read permission is mandatory.
 await capturePersistentPairedRecords(source);
 // @ts-expect-error The private development reader is not public-root API.
 publicRoot.capturePersistentPairedRecords(source,()=>{});
 read.dispose();
}
void pairedRecordReadContract;
