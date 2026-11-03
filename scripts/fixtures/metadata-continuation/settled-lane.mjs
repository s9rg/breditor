/** Original owned delivery protocols obtain real authenticated receipts before
 * replacement. Other lanes remain pending to check both kinds of original facts. */
import assert from 'node:assert/strict';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import {withNativeRelayDelivery} from '../../../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {createNativeVersionDelivery} from '../../../packages/breditor-collaboration/dist/versions/native_delivery.js';
import {createNativeSuggestionDelivery} from '../../../packages/breditor-collaboration/dist/suggestions/native_delivery.js';
import {createNativeRevisionDelivery} from '../../../packages/breditor-collaboration/dist/suggestion_revisions/native_delivery.js';
export async function settleOriginalMetadataLane({metadata,review,row,chosen,auth,seeded}){
 const adapters=[],context=metadata.createDelivery(row.source,'comment');
 try{const children=await metadata.prepare(row.source,context),common={autoConnect:false,getToken:auth.getToken,requestTimeoutMs:10000};assert.ok(children.versions&&children.suggestions&&children.revisions);
  const doc=new api.SharedRelaySync(row.source.core,withNativeRelayDelivery({...common,identity:auth.document,suggestions:{binding:chosen.binding.suggestions.identity.binding,effectWriter:chosen.binding.suggestions.identity.effectWriter},suggestionRevisions:chosen.binding.revisions},context));adapters.push(doc);await doc.connect();await doc.flush();const before=row.source.core.documentJson(),comments=review.createReviewSync(context,{...common,identity:auth.review,flushDocument:()=>doc.flush()});adapters.push(comments);await comments.connect();await comments.flush();
  const versions=createNativeVersionDelivery(children.versions,context,{getToken:auth.getToken,flushDocument:()=>doc.flush(),requestTimeoutMs:10000});await versions.connect();await versions.flushShared();const parent=createNativeSuggestionDelivery(children.suggestions,doc,context),revisions=createNativeRevisionDelivery(children.revisions,parent);await revisions.connect();await parent.connect();await parent.flushShared();const info=children.revisions.revisions()[0],status=revisions.status(info.id);assert.ok(status.receipt);assert.equal(status.retry,false);assert.equal(status.localSaved,true);assert.equal(status.packet,seeded.revision);assert.equal(children.suggestions.packet(info.suggestion.id),row.source.core.revisionSuggestionPacket(seeded.packet,seeded.revision));assert.equal(children.suggestions.status(info.previousSuggestionId).decision.decision,'reject');assert.ok(children.versions.versionStatus(row.source.core.readVersion(seeded.version).id).accepted);assert.equal(row.source.core.documentJson(),before);assert.ok(comments.state().lastReceipt);
 }finally{await context.close();for(const adapter of adapters)adapter.dispose();await Promise.all(adapters.map(adapter=>adapter.waitForDisconnected()));}
}
