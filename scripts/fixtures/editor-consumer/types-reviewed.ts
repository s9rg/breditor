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
import {SharedSuggestionObserverRelay,registerSharedSuggestionObserver,sharedSuggestionObserverQueueIdentity,type SharedSuggestionObserverIdentity,type SharedSuggestionTransport} from "@breditor/editor/collaboration";
async function reader(options:Omit<SharedSuggestionQueueOptions,"identity">,identity:SharedSuggestionObserverIdentity):Promise<void>{
 const relay=new SharedSuggestionObserverRelay({identity,storage:options.storage,getToken:()=>"host token",autoConnect:false}),port:SharedSuggestionTransport=relay;
 const queue=await SharedSuggestionQueue.open({...options,identity:sharedSuggestionObserverQueueIdentity(identity)});await port.connect();await port.flush();await queue.close();relay.dispose();
 // @ts-expect-error Observer transport cannot accept a document-author resume credential instead.
 new SharedSuggestionObserverRelay({identity:{...sharedSuggestionObserverQueueIdentity(identity),credential:"author"},storage:options.storage,getToken:()=>"token"});
 // @ts-expect-error The observer helper requires explicitly selected atomic V2.
 registerSharedSuggestionObserver({endpoint:identity.endpoint,room:identity.room,principal:identity.principal,getToken:()=>"token",saveIdentity(){}});
}
void reader;
import {mountSharedSuggestionPanel,createSharedSuggestionPanelSource,mountSharedReviewPanel,standardSharedSuggestionActions,type SharedSuggestionSync,type SharedSuggestionPanelOptions,type SharedSelectionPolicy,type SharedSuggestionPanelCore} from "@breditor/editor/collaboration";
function proposalControls(host:HTMLElement,queue:SharedSuggestionQueue<SharedSelectionPolicy>,sync:SharedSuggestionSync<SharedSelectionPolicy>):void{
 const source=createSharedSuggestionPanelSource(queue,sync),options:SharedSuggestionPanelOptions={source,actions:standardSharedSuggestionActions,allocate:kind=>`fresh-${kind}`,policy:()=>({canPropose:true,canAccept:true,canReject:true})};
 const core:SharedSuggestionPanelCore=queue.core,panel=mountSharedSuggestionPanel(host,core,options);panel.refresh();panel.dispose();
 mountSharedReviewPanel(host,queue.core,{policy:()=>({principal:"alice",access:"comment"}),suggestions:options});
 // @ts-expect-error Strings cannot substitute for current opaque native previews.
 source.queueDecision("id","accept","1","snapshot JSON");
 // @ts-expect-error No accepted-document dispatcher is provided to pure action builders.
 options.actions?.[0]?.draft({core:queue.core,view:core.view(),values:{},model:{} as never,allocate:kind=>kind});
}
void proposalControls;
