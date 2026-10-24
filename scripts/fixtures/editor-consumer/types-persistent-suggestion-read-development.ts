/** Original record discovery is data inspection, not a native or server grant. */
import * as publicRoot from '@breditor/collaboration';
import {borrowPersistentSuggestionRecords} from '../../../packages/breditor-collaboration/dist/suggestions/queue.js';
import {OriginalPersistentSuggestionRead} from '../../../packages/breditor-collaboration/dist/suggestions/persistent_read.js';
declare const queue:publicRoot.SharedSuggestionQueue<'document-v1'>;
async function recordReadContract(){
 const read=await borrowPersistentSuggestionRecords(queue,()=>{});read.check();await read.verify();read.checkCurrent();const metadata=read.metadata();
 const scope:'original-store-committed-pending-live'=metadata.scope;void scope;
 // @ts-expect-error Rows returned for a retained diagnostic report remain immutable.
 metadata.committed.retained.push({});
 // @ts-expect-error Frozen row decisions cannot be changed through the report.
 metadata.committed.retained[0]!.publish=false;
 // @ts-expect-error Account bindings are immutable diagnostic data.
 metadata.live.identity.principal='different';
 // @ts-expect-error No editing native owner is exposed.
 read.core.dispatch({commands:[]});
 // @ts-expect-error No restoration/handoff method exists.
 read.intoParts();
 // @ts-expect-error Read metadata cannot activate a server.
 read.activate();
 // @ts-expect-error Read authority must be explicit.
 await borrowPersistentSuggestionRecords(queue);
 // @ts-expect-error Only the owner reader constructs these handles.
 new OriginalPersistentSuggestionRead({},metadata,{});
 // @ts-expect-error The development reader is not a public-root API.
 publicRoot.borrowPersistentSuggestionRecords(queue,()=>{});
 read.dispose();
}
void recordReadContract;
