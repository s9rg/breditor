import {SharedSuggestionRevisions,createSharedSuggestionPanelSource,type SharedRichEditor,type SharedSelectionPolicy,type SharedSuggestionQueue,type SharedSuggestionSync,type SharedSuggestionTransport,type SharedSuggestionQueueOptions,type SharedSuggestionRevisionRequest} from "@breditor/editor/collaboration";
async function revisions<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,queue:SharedSuggestionQueue<P>,sync:SharedSuggestionSync<P>,transport:SharedSuggestionTransport<P>,storage:SharedSuggestionQueueOptions<P>["storage"]):Promise<void>{
 const outbox=await SharedSuggestionRevisions.open({database:"host-owned-revision-store",binding:"c".repeat(64),queue,transport,storage});
 const native=core.captureSuggestionRevision("predecessor","Full replacement","0",{scope:"commands",edit:{kind:"commands",data:[]}});core.readSuggestionRevision("predecessor",native);core.verifySuggestionRevision("predecessor",native);core.revisionSuggestionPacket("predecessor",native);
 const source=createSharedSuggestionPanelSource(queue,sync,outbox);source.canRevise?.("id");outbox.checkQueue(queue);await outbox.synchronize();const entries=outbox.entries();if(entries[0])await outbox.loadRevision(entries[0].revision.id);await outbox.close();
 const request:SharedSuggestionRevisionRequest={kind:"suggestionRevisionPublish",previousSuggestionId:"id",revisionPacket:native};void request;
 // @ts-expect-error The browser cannot supply authenticated creator authority.
 core.captureSuggestionRevision("predecessor","title","0",{scope:"commands",edit:{kind:"commands",data:[]}},"revision","forged-author");
 // @ts-expect-error A revision request never independently publishes the extracted child packet.
 const wrong:SharedSuggestionRevisionRequest={kind:"suggestionPublish",packet:"child"};void wrong;
}
void revisions;
