/** The new private readers accept genuine owners, not a format tag or data DTO. */
import {captureOriginalNativeRecords} from '../../../packages/breditor-collaboration/dist/persistence/shared_session.js';
import {captureOriginalVersionRecords} from '../../../packages/breditor-collaboration/dist/versions/catalog.js';
import {captureOriginalRevisionRecords} from '../../../packages/breditor-collaboration/dist/suggestion_revisions/outbox.js';
import type {SharedPersistentSession,SharedDocumentVersions,SharedSuggestionRevisions} from '../../../packages/breditor-collaboration/dist/index.js';
declare const source:SharedPersistentSession,versions:SharedDocumentVersions,revisions:SharedSuggestionRevisions;
const native=await captureOriginalNativeRecords(source,()=>{}),catalog=await captureOriginalVersionRecords(versions,()=>{}),outbox=await captureOriginalRevisionRecords(revisions,()=>{});
const n=native.metadata(),v=catalog.metadata(),r=outbox.metadata();native.checkCurrent();await catalog.verify();outbox.check();native.dispose();catalog.dispose();outbox.dispose();
// @ts-expect-error Stored identity cannot be replaced.
n.identity.writer='999';
// @ts-expect-error Native LIVE bytes are immutable.
n.live.checkpoint='replacement';
// @ts-expect-error Version packet arrays are immutable.
v.committed.packets.push({});
// @ts-expect-error Nested retained intent is immutable.
if(v.committed.packets[0])v.committed.packets[0].publish=true;
// @ts-expect-error Revision arrays are immutable.
r.live.retained.push({});
// @ts-expect-error The owned queue metadata is immutable too.
if(r.queue.live.retained[0])r.queue.live.retained[0].publish=true;
// @ts-expect-error Read metadata is not a native session.
await captureOriginalNativeRecords(n,()=>{});
// @ts-expect-error A native owner cannot select a revision reader by shape.
await captureOriginalRevisionRecords(source,()=>{});
// @ts-expect-error Version metadata cannot select its own adapter.
await captureOriginalVersionRecords(v,()=>{});
