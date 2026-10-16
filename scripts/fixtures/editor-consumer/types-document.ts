import {SharedRichEditor,SharedPersistentSession,createSharedDocumentEditor,restoreSharedDocumentEditor,type SharedRustOwner,type SharedRustProfile,type SharedView,type SharedDocumentView} from "@breditor/collaboration";
function original(raw:SharedRustOwner):void {
 const core=new SharedRichEditor(raw),view:SharedView=core.view();void view;
 // @ts-expect-error document scope requires an explicit typed owner policy
 core.selectDocument();
 // @ts-expect-error document clipboard requires an explicit typed owner policy
 core.pasteDocumentClipboard("opaque native clipboard","reserved");
}
function document(raw:SharedRustOwner,profile:SharedRustProfile):void {
 const named=createSharedDocumentEditor(raw),namedView:SharedDocumentView=named.view();void namedView;
 const core=new SharedRichEditor<"document-v1">(raw,{selectionEditing:"document-v1"}),view:SharedDocumentView=core.view();
 const policy:"document-v1"=core.selectionPolicy();void policy;
 core.selectDocument();core.copyDocument();core.replaceDocumentPlainText("fresh","Q");core.replaceDocumentTypingText("fresh2","Q","1");
 core.supportsDocumentClipboard();core.pasteDocumentClipboard("opaque native clipboard","reserved");
 core.supportsDocumentNavigation();core.collapseDocumentSelection("before");
 // @ts-expect-error logical sides are not physical arrow names
 core.collapseDocumentSelection("left");
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
import type {RichCoreProfile,RichCoreEditor,RichView,RichDocumentView as LocalDocumentView} from "@breditor/experimental-rich-content";
import {RichDocumentSessionStore} from "@breditor/experimental-rich-content";
async function localDocument(profile:RichCoreProfile):Promise<void>{
 if(!profile.createDocumentEditor||!profile.restoreDocumentEditor||!profile.restoreOriginalAsDocumentEditor)throw Error("Missing explicit capability");
 const core=profile.createDocumentEditor("native document"),view:LocalDocumentView=core.view();void view;core.selectDocument();core.copyDocument();core.replaceDocumentPlainText("fresh","Q");core.replaceDocumentTypingText("fresh2","Q","1");
 core.supportsDocumentClipboard();core.pasteDocumentClipboard("opaque native clipboard","reserved");
 core.supportsDocumentNavigation();core.collapseDocumentSelection("after");
 profile.restoreDocumentEditor(core.checkpointJson());profile.restoreOriginalAsDocumentEditor("original checkpoint","typing-v1");
 // @ts-expect-error document views cannot masquerade as original local views
 const oldView:RichView=core.view();void oldView;
 // @ts-expect-error original DOM controllers have not opted into document scope
 const oldCore:RichCoreEditor=core;void oldCore;
 // @ts-expect-error original setSelection command stays closed
 core.execute({kind:"setSelection",selection:{kind:"document"}});
 const store=await RichDocumentSessionStore.open("explicit-local-document",{richLanguage:3,history:"typing-v1"});await store.save(core.checkpointJson());await store.load();store.close();
}
void localDocument;
import {mountRichEditor,mountDocumentRichEditor,RichDomEditor,createLayoutRichToolbarV3,type RichDocumentCoreEditor,type RichInlinePresentation,type RichDocumentEditorOptions} from "@breditor/experimental-rich-content";
import {model,documentModel} from "@breditor/experimental-rich-content/rendering";
function documentDom(host:HTMLElement,core:RichDocumentCoreEditor,original:RichCoreEditor,presentation:RichInlinePresentation):void {
 const options:RichDocumentEditorOptions={core,selectionEditing:"document-v1",toolbar:createLayoutRichToolbarV3(core,presentation),onChange:view=>{const v:LocalDocumentView=view;void v;}};
 const dom=mountDocumentRichEditor(host,options),view:LocalDocumentView=dom.view();void view;
 dom.selectDocument();dom.pasteDocumentClipboard("opaque native clipboard");dom.replaceDocumentPlainText("Q");dom.collapseDocumentSelection("after");
 documentModel(core.view());model(original.view());
 // @ts-expect-error original models remain closed to extended views
 model(core.view());
 // @ts-expect-error an original mount does not select the extended policy
 mountRichEditor(host,options);
 // @ts-expect-error an extended native owner alone is insufficient without explicit policy
 new RichDomEditor<"document-v1">(host,{core});
 const old=mountRichEditor(host,{core:original});
 // @ts-expect-error original coordinators cannot submit named document intents
 old.selectDocument();
 // @ts-expect-error document coordinators are not original view/selection producers
 const oldDom:RichDomEditor=dom;void oldDom;
}
void documentDom;
import {mountSharedEditor,mountSharedDocumentEditor,SharedDomEditor,createLayoutSharedToolbarV3,type SharedDocumentDomOptions} from "@breditor/collaboration";
function sharedDocumentDom(host:HTMLElement,core:SharedRichEditor<"document-v1">,original:SharedRichEditor,presentation:RichInlinePresentation):void {
 const options:SharedDocumentDomOptions={core,selectionEditing:"document-v1",toolbar:createLayoutSharedToolbarV3(core,presentation),onChange:event=>{const view:SharedDocumentView=event.view;void view;}};
 const dom=mountSharedDocumentEditor(host,options),view:SharedDocumentView=dom.view();void view;
 dom.selectDocument();dom.pasteDocumentClipboard("opaque native clipboard");dom.replaceDocumentPlainText("Q");dom.collapseDocumentSelection("before");
 const capable:boolean=core.supportsDocumentTools();void capable;core.selectionCoverage("document");core.selectionFormatState("breditor/strong");core.blockLayoutState();core.changeSelectionLayout({alignment:"center"});
 // @ts-expect-error an original mount does not select the document view family
 mountSharedEditor(host,options);
 // @ts-expect-error a document owner alone is insufficient without the explicit policy
 new SharedDomEditor<"document-v1">(host,{core});
 const old=mountSharedEditor(host,{core:original});
 // @ts-expect-error original coordinators cannot submit named document intents
 old.selectDocument();
 // @ts-expect-error extended coordinators cannot masquerade as original producers
 const oldDom:SharedDomEditor=dom;void oldDom;
 // @ts-expect-error original dispatch selection DTOs remain closed
 dom.execute({selectionUpdate:{kind:"set",value:{kind:"document"}},commands:[]});
}
void sharedDocumentDom;
