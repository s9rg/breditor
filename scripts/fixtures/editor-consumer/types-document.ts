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
import {openLocalEditor,openLocalDocumentEditor,type LocalEditor,type LocalDocumentEditorOptions,RichDocumentSessionStore as RootDocumentStore} from "@breditor/editor";
import {openSharedEditor,openSharedDocumentEditor,type SharedEditorSession,type SharedDocumentEditorSessionOptions,type SharedDocumentEditorRecovery} from "@breditor/editor/collaboration";
import type {BreditorEditorProps,BreditorDocumentEditorProps,BreditorDocumentEditorHandle} from "@breditor/editor/react";
import type {BreditorSharedEditorProps,BreditorSharedDocumentEditorProps,BreditorSharedDocumentEditorHandle} from "@breditor/editor/collaboration/react";
async function documentSdk(host:HTMLElement):Promise<void>{
 const options:LocalDocumentEditorOptions={host,selectionEditing:"document-v1",richLanguage:3,onChange:view=>{const v:LocalDocumentView=view;void v;}};
 const editor=await openLocalDocumentEditor(options);editor.selectDocument();editor.pasteDocumentClipboard("opaque");editor.collapseDocumentSelection("after");const view:LocalDocumentView=editor.view();void view;void RootDocumentStore;
 // @ts-expect-error original startup must not adopt document options implicitly
 openLocalEditor(options);
 // @ts-expect-error original top-level owner cannot produce document views
 const old:LocalEditor=editor;void old;
 // @ts-expect-error no sniffing of old checkpoint tags in the document factory
 openLocalDocumentEditor({host,selectionEditing:"document-v1",initial:{kind:"checkpoint",checkpointJson:"opaque"}});
 const sharedOptions:SharedDocumentEditorSessionOptions={host,selectionEditing:"document-v1",database:"document",room:"room",writer:"101",onChange:event=>{const v:SharedDocumentView=event.view;void v;}};
 const shared=await openSharedDocumentEditor(sharedOptions);shared.selectDocument();shared.replaceDocumentPlainText("Q");const recovery:SharedDocumentEditorRecovery=shared;const policy:"document-v1"=recovery.selectionPolicy();void policy;
 // @ts-expect-error original durable startup does not adopt a new selection family
 openSharedEditor(sharedOptions);
 // @ts-expect-error original shared owners do not produce document selections
 const oldShared:SharedEditorSession=shared;void oldShared;
 // @ts-expect-error document recovery is an explicit discriminator, not a general journal
 openSharedDocumentEditor({...sharedOptions,initial:{kind:"generalCheckpoint",checkpointJson:"opaque"}});
 await shared.close();editor.dispose();
}
function documentReact(local:BreditorDocumentEditorHandle,shared:BreditorSharedDocumentEditorHandle):void {
 local.selectDocument();local.pasteDocumentClipboard("opaque");shared.selectDocument();shared.replaceDocumentPlainText("Q");
 const localProps:BreditorDocumentEditorProps={initialOptions:{selectionEditing:"document-v1"},onChange:view=>{const v:LocalDocumentView=view;void v;}};
 const sharedProps:BreditorSharedDocumentEditorProps={initialOptions:{selectionEditing:"document-v1",database:"d",room:"r",writer:"1"},onCloseError:(_error,recovery)=>{const policy:"document-v1"=recovery.selectionPolicy();void policy;}};
 // @ts-expect-error the original React component cannot adopt document initial options or callbacks
 const old:BreditorEditorProps=localProps;void old;
 // @ts-expect-error the original shared component cannot adopt document initial options
 const oldShared:BreditorSharedEditorProps=sharedProps;void oldShared;
}
void documentSdk;void documentReact;
import {SharedPresence,createSharedDocumentPresence,SharedPresenceOverlay,SharedRelaySync,createSharedDocumentRelaySync,type SharedDocumentRelayOptions,type SharedPresenceResolution} from "@breditor/collaboration";
function documentRelay(core:SharedRichEditor<"document-v1">,original:SharedRichEditor,dom:SharedDomEditor<"document-v1">):void {
 const presence=createSharedDocumentPresence(core,{autoExpire:false});const policy:"document-v1"=presence.selectionPolicy();void policy;
 const resolution:SharedPresenceResolution<"document-v1">=core.resolvePresence("opaque document frame");void resolution;
 const options:SharedDocumentRelayOptions={selectionEditing:"document-v1",identity:{endpoint:"ws://127.0.0.1:5000/ws",principal:"alice",room:"room",writer:"101",credential:"secret",writerTransport:"atomic-v2"},getToken:()=>"token",presence};
 createSharedDocumentRelaySync(core,options);new SharedRelaySync(core,options);new SharedPresenceOverlay({editor:dom,presence,selectionEditing:"document-v1"});
 // @ts-expect-error a document presence registry requires explicit construction policy
 new SharedPresence(core);
 // @ts-expect-error original registry types cannot produce document selections
 const oldPresence:SharedPresence=presence;void oldPresence;
 // @ts-expect-error original relay options do not declare the document checkpoint/presence family
 new SharedRelaySync(core,{identity:options.identity,getToken:options.getToken});
 // @ts-expect-error document relay requires an explicitly selected V2 identity
 createSharedDocumentRelaySync(core,{...options,identity:{endpoint:"ws://127.0.0.1:5000/ws",principal:"alice",room:"room",writer:"101",credential:"secret"}});
 // @ts-expect-error an original owner cannot be adopted by document relay options
 createSharedDocumentRelaySync(original,options);
 // @ts-expect-error original resolution consumers cannot adopt document scope
 const oldResolution:SharedPresenceResolution=resolution;void oldResolution;
 // @ts-expect-error the overlay also requires its explicit document presentation family
 new SharedPresenceOverlay({editor:dom,presence});
}
void documentRelay;
