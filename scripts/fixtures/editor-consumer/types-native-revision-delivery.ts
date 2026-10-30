/** Original nominal outbox and opaque live parent only; no ordinary API gain. */
import * as api from '@breditor/collaboration';
import {createNativeRevisionDelivery,type NativeRevisionDelivery} from '../../../packages/breditor-collaboration/dist/suggestion_revisions/native_delivery.js';
import type {NativeSuggestionDelivery} from '../../../packages/breditor-collaboration/dist/suggestions/native_delivery.js';
declare const outbox:api.SharedSuggestionRevisions<'document-v1'>,parent:NativeSuggestionDelivery;
const delivery:NativeRevisionDelivery<'document-v1'>=createNativeRevisionDelivery(outbox,parent,{onState(state){const saved:boolean=state.localSaved;void saved;}});
const connected:Promise<void>=delivery.connect(),flushed:Promise<void>=delivery.flushLocal(),closed:Promise<void>=delivery.close();
// @ts-expect-error Ordinary root exports do not grant native revision execution.
api.createNativeRevisionDelivery(outbox,parent);
// @ts-expect-error Detached recovery data cannot replace the actual original outbox.
createNativeRevisionDelivery(outbox.exportRecovery(),parent);
// @ts-expect-error Native delivery cannot capture or queue a new revision.
delivery.revise({previousSuggestionId:'id',title:'title',createdAtMs:'1',draft:{}});
// @ts-expect-error Startup remains explicit.
createNativeRevisionDelivery(outbox,parent,{autoStart:true});
// @ts-expect-error No replacement storage is accepted.
createNativeRevisionDelivery(outbox,parent,{storage:{}});
// @ts-expect-error Fresh credentials belong to the parent's genuine selected transport.
createNativeRevisionDelivery(outbox,parent,{getToken:()=>''});
// @ts-expect-error Another borrowed transport cannot replace the parent's registered one.
createNativeRevisionDelivery(outbox,parent,{transport:{}});
void connected;void flushed;void closed;
