import {SharedRichEditor,SharedPersistentSession,createSharedDocumentEditor,restoreSharedDocumentEditor,type SharedRustOwner,type SharedRustProfile,type SharedView,type SharedDocumentView} from "@breditor/collaboration";
function original(raw:SharedRustOwner):void {
 const core=new SharedRichEditor(raw),view:SharedView=core.view();void view;
 // @ts-expect-error document scope requires an explicit typed owner policy
 core.selectDocument();
}
function document(raw:SharedRustOwner,profile:SharedRustProfile):void {
 const named=createSharedDocumentEditor(raw),namedView:SharedDocumentView=named.view();void namedView;
 const core=new SharedRichEditor<"document-v1">(raw,{selectionEditing:"document-v1"}),view:SharedDocumentView=core.view();
 const policy:"document-v1"=core.selectionPolicy();void policy;
 core.selectDocument();core.copyDocument();core.replaceDocumentPlainText("fresh","Q");core.replaceDocumentTypingText("fresh2","Q","1");
 const recovered=restoreSharedDocumentEditor(profile,"room",core.checkpointJson());void recovered;
 // @ts-expect-error extended views cannot masquerade as an original selection protocol
 const old:SharedView=view;void old;
 // @ts-expect-error original DOM/storage APIs have not opted into document selections
 const oldCore:SharedRichEditor=core;void oldCore;
 // @ts-expect-error selecting the new generic alone is not the required explicit runtime option
 new SharedRichEditor<"document-v1">(raw);
}
void original;void document;
async function documentSession(raw:SharedRustOwner):Promise<void>{
 const session=await SharedPersistentSession.openDocument({database:"explicit-document",room:"room",writer:"303",create:()=>raw,restore:()=>raw,restoreDocument:()=>raw});
 const view:SharedDocumentView=session.core.view();void view;session.core.selectDocument();
 // @ts-expect-error a document session is not an original durable session
 const original:SharedPersistentSession=session;void original;
 // @ts-expect-error separate declared document recovery is required
 SharedPersistentSession.openDocument({database:"explicit-document",room:"room",writer:"303",create:()=>raw,restore:()=>raw});
}
void documentSession;
