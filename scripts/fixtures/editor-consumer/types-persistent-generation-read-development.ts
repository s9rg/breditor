/** Detached immutable data never substitutes for actual source admission. */
import {captureSegmentedPersistentRecords} from '../../../packages/breditor-collaboration/dist/persistence/segmented_session.js';
import {captureRelayGenerationRecords} from '../../../packages/breditor-collaboration/dist/segmented_relay/session.js';
import type {SharedSegmentedPersistentSession,SharedSegmentedRelaySession} from '../../../packages/breditor-collaboration/dist/index.js';
declare const local:SharedSegmentedPersistentSession,relay:SharedSegmentedRelaySession;
const read=await captureSegmentedPersistentRecords(local,()=>{}),other=await captureRelayGenerationRecords(relay,()=>{}),m=read.metadata();
read.check();read.checkCurrent();await read.verify();read.dispose();other.dispose();
// @ts-expect-error Complete committed head is not writable.
m.committed.head='replacement';
// @ts-expect-error Complete immutable-file list is not writable.
m.committed.files.push({});
// @ts-expect-error Native identity cannot be reassigned.
m.committed.record.identity.writer='999';
if(m.pending){
 // @ts-expect-error Pending ordered version bytes cannot be changed.
 m.pending.versions.push('replacement');
}
// @ts-expect-error A metadata snapshot is not a native session.
await captureSegmentedPersistentRecords(m,()=>{});
// @ts-expect-error Storage-family choice is determined by the genuine owner.
await captureRelayGenerationRecords(local,()=>{});
