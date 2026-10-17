import {SharedRichEditor,SharedReviewPersistentSession,SharedSuggestionQueue,restoreSharedReviewedEditor,type SharedRustOwner,type SharedRustProfile,type SharedReviewedHistoryIdentity,type SharedReviewedReviewSessionOptions,type SharedSuggestionQueueOptions,type SharedOwnedSuggestionAcceptance,type SharedDocumentSuggestionEffect,type SharedDocumentView} from "@breditor/editor/collaboration";
const identity:SharedReviewedHistoryIdentity={binding:"a".repeat(64),principal:"alice",effectWriter:"404"};
function proofBoundary(raw:SharedRustOwner,profile:SharedRustProfile,effect:SharedDocumentSuggestionEffect,acceptance:SharedOwnedSuggestionAcceptance):void {
 const core=new SharedRichEditor(raw,{reviewedHistory:identity});
 const selected:SharedReviewedHistoryIdentity|null=core.reviewedHistoryIdentity();void selected;
 const verified=core.verifySuggestionEffect("native packet",effect);
 if(verified.kind==="verified"){core.checkSuggestionEffect(verified.proof);core.adoptSuggestionHistory(verified.proof,"native packet",acceptance);verified.proof.dispose();}
 const restored:SharedRustOwner=restoreSharedReviewedEditor(profile,"room",core.checkpointJson());void restored;
 // @ts-expect-error A receipt string is not a live owner-bound native proof.
 core.adoptSuggestionHistory("metadata","native packet",acceptance);
 // @ts-expect-error Server order must remain exact canonical decimal text.
 const wrong:SharedOwnedSuggestionAcceptance={...acceptance,sequence:9007199254740993};void wrong;
}
async function paired(options:SharedReviewedReviewSessionOptions<"document-v1">,queueOptions:Omit<SharedSuggestionQueueOptions<"document-v1">,"storage">):Promise<void>{
 const session=await SharedReviewPersistentSession.openReviewed(options),view:SharedDocumentView=session.core.view();void view;
 const queue=await SharedSuggestionQueue.open({...queueOptions,ownedHistory:"reviewed-v1",storage:session});await queue.close();await session.close();
 // @ts-expect-error Reviewed recovery cannot substitute for the original restore callback.
 SharedReviewPersistentSession.open(options);
 // @ts-expect-error The new queue mode is explicit and closed.
 SharedSuggestionQueue.open({...queueOptions,ownedHistory:"automatic",storage:session});
}
void proofBoundary;void paired;
