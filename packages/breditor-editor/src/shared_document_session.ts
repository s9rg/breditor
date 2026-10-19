/** Explicit top-level document session; ordinary/general startup and durable discriminators remain closed. */
import {compileStandardSharedProfileV1,compileStandardStructuralSharedProfileV2,compileStandardLayoutSharedProfileV3,supportsSharedDocumentSelection,restoreSharedDocumentEditor,restoreSharedGeneralEditor,restoreSharedTypingEditor,SharedPersistentSession,SharedEditorError,mountSharedDocumentEditor,createStandardSharedToolbarV1,createStructuralSharedToolbarV2,createLayoutSharedToolbarV3,type SharedRustProfile,type SharedProfileConfiguration,type SharedProfileConfigurationV2,type SharedProfileConfigurationV3,type SharedProfileDescriptor,type SharedRustOwner,type SharedRichEditor,type SharedDomEditor,type SharedDocumentDomOptions,type SharedToolbarControl,type SharedEditorOptions,type SharedSaveState,type SharedDocumentView,type SharedDispatch} from "@breditor/collaboration";
import {createStandardRichInlinePresentationV1} from "@breditor/experimental-rich-content";
import type {RichSearchHost} from "@breditor/experimental-rich-content";
import type {SharedSearchResults} from "@breditor/collaboration";
import {supportsSharedSearchHistory,restoreSharedSearchEditor} from "@breditor/collaboration";
import {initializeSharedRuntime,standardSharedProfileConfiguration,structuralSharedProfileConfigurationV2,layoutSharedProfileConfigurationV3} from "./shared_profile.js";
import {claimHost,awaitInitialization} from "./host.js";
import {emptyDocumentJson} from "./empty_document.js";
import {clipboardInterchangeOptions,type ClipboardInterchangeFactory} from "./clipboard_interchange.js";
import {validateMarkdownInputPolicy} from "@breditor/experimental-rich-content/rendering";
import type {SharedInitial,SharedSearchInitial,SharedEditorSessionOptions} from "./shared_session.js";
import {SharedDocumentEditorOpenError,type SharedDocumentEditorRecovery} from "./shared_document_open_error.js";
export {SharedDocumentEditorOpenError,type SharedDocumentEditorRecovery} from "./shared_document_open_error.js";

export type SharedDocumentInitial=Extract<SharedInitial,{kind:"resume"|"empty"|"document"|"frame"}>
 |{kind:"documentCheckpoint";checkpointJson:string}
 |{kind:"documentTypingCheckpoint";checkpointJson:string};
export interface SharedDocumentEditorSessionOptions extends Omit<SharedDocumentDomOptions,"core"|"coreOwnership"|"toolbar"|"inlinePresentation"|"inlineTag"|"clipboardInterchange">,Pick<SharedEditorSessionOptions,"host"|"database"|"room"|"writer"|"configuration"|"additionalInlinePresentation"|"richLanguage"|"readOnly"|"history"|"runtimeInput"|"signal"|"onSaveState"> {
 initial?:SharedDocumentInitial;rangeEditing?:"general-v1";
 coreOptions?:Omit<SharedEditorOptions<"document-v1">,"selectionEditing"|"onError"|"searchHistory">;
 onClosing?:(editor:SharedDocumentEditorSession)=>void;
 toolbar?:(core:SharedRichEditor<"document-v1">,standard:readonly SharedToolbarControl<"document-v1">[])=>readonly SharedToolbarControl<"document-v1">[];
 clipboardInterchange?:ClipboardInterchangeFactory<SharedRichEditor<"document-v1">>;
}
export interface SharedDocumentSearchEditorSessionOptions extends Omit<SharedDocumentEditorSessionOptions,"initial"|"history"|"richLanguage"> {
 initial?:SharedSearchInitial;history:"explicit"|"typing-v1";richLanguage:1|2|3;
}
/** Borrow the actual document owner; relay/presence adapters require their own explicit compatible policy. */
export interface SharedDocumentEditorSession extends SharedDocumentEditorRecovery {
 readonly surface:HTMLDivElement;readonly toolbar:HTMLDivElement;readonly status:HTMLParagraphElement;readonly recovered:boolean;
 readonly core:SharedRichEditor<"document-v1">;
 execute(request:SharedDispatch,focus?:boolean,revision?:string):void;
 select(...args:Parameters<SharedDomEditor<"document-v1">["select"]>):void;
 selectDocument(...args:Parameters<SharedDomEditor<"document-v1">["selectDocument"]>):void;
 replaceDocumentPlainText(...args:Parameters<SharedDomEditor<"document-v1">["replaceDocumentPlainText"]>):void;
 pasteDocumentClipboard(...args:Parameters<SharedDomEditor<"document-v1">["pasteDocumentClipboard"]>):void;
 collapseDocumentSelection(...args:Parameters<SharedDomEditor<"document-v1">["collapseDocumentSelection"]>):void;
 focus():void;refreshAssets():void;
 setReadOnly(value:boolean,revision?:string):boolean;closeTypingGroup(revision?:string):boolean;
 search():RichSearchHost<SharedSearchResults>;
 writing():import("@breditor/experimental-rich-content").RichWritingToolsHost;
 view():SharedDocumentView;state():SharedSaveState;flush():Promise<void>;retrySave():Promise<void>;
}
class DocumentSessionOwner implements SharedDocumentEditorSession {
 readonly surface:HTMLDivElement;readonly toolbar:HTMLDivElement;readonly status:HTMLParagraphElement;readonly recovered:boolean;readonly core:SharedRichEditor<"document-v1">;
 #session:SharedPersistentSession<"document-v1">;#dom:SharedDomEditor<"document-v1">;#release:()=>void;#options:Omit<SharedDocumentEditorSessionOptions,"initial">;
 #phase:"active"|"closing"|"closed"="active";#closing:Promise<void>|undefined;
 constructor(session:SharedPersistentSession<"document-v1">,dom:SharedDomEditor<"document-v1">,release:()=>void,options:Omit<SharedDocumentEditorSessionOptions,"initial">){this.#session=session;this.#dom=dom;this.#release=release;this.#options=options;this.core=session.core;this.recovered=session.recovered;this.surface=dom.surface;this.toolbar=dom.toolbar;this.status=dom.status;}
 #active():void{if(this.#phase!=="active")throw Error("The shared document editor is closing or closed");}
 selectionPolicy():"document-v1"{return "document-v1";}rangePolicy():"general-v1"{return "general-v1";}
 historyPolicy():"explicit"|"typing-v1"{return this.core.view().historyGrouping==="typing-v1"?"typing-v1":"explicit";}
 searchHistoryPolicy():"search-v1"|null{return this.core.searchHistoryPolicy();}
 execute(...args:Parameters<SharedDocumentEditorSession["execute"]>):void{this.#active();this.#dom.execute(...args);}
 select(...args:Parameters<SharedDocumentEditorSession["select"]>):void{this.#active();this.#dom.select(...args);}
 selectDocument(...args:Parameters<SharedDocumentEditorSession["selectDocument"]>):void{this.#active();this.#dom.selectDocument(...args);}
 replaceDocumentPlainText(...args:Parameters<SharedDocumentEditorSession["replaceDocumentPlainText"]>):void{this.#active();this.#dom.replaceDocumentPlainText(...args);}
 pasteDocumentClipboard(...args:Parameters<SharedDocumentEditorSession["pasteDocumentClipboard"]>):void{this.#active();this.#dom.pasteDocumentClipboard(...args);}
 collapseDocumentSelection(...args:Parameters<SharedDocumentEditorSession["collapseDocumentSelection"]>):void{this.#active();this.#dom.collapseDocumentSelection(...args);}
 focus():void{this.#active();this.#dom.focus();}refreshAssets():void{this.#active();this.#dom.refreshAssets();}
 setReadOnly(...args:Parameters<SharedDocumentEditorSession["setReadOnly"]>):boolean{this.#active();return this.#dom.setReadOnly(...args);}
 closeTypingGroup(...args:Parameters<SharedDocumentEditorSession["closeTypingGroup"]>):boolean{this.#active();return this.#dom.closeTypingGroup(...args);}
 search():RichSearchHost<SharedSearchResults>{this.#active();return this.#dom;}
 writing():import("@breditor/experimental-rich-content").RichWritingToolsHost{this.#active();return this.#dom;}
 view():SharedDocumentView{return this.core.view();}checkpointJson():string{return this.core.checkpointJson();}
 state():SharedSaveState{return this.#session.state();}flush():Promise<void>{return this.#session.flush();}retrySave():Promise<void>{return this.#session.retry();}
 #retireUi():void{
  if(this.#phase!=="active")return;this.#phase="closing";this.surface.contentEditable="false";
  try{this.#options.onClosing?.(this);}catch(error){try{this.#options.onError?.(error);}catch{/* Reporting cannot cancel durable retirement. */}}
  try{this.#dom.dispose();}finally{this.#release();}
 }
 close():Promise<void>{if(this.#closing)return this.#closing;if(this.#phase==="closed")return Promise.resolve();this.#retireUi();this.#closing=this.#session.close().then(()=>{this.#phase="closed";}).finally(()=>{this.#closing=undefined;});return this.#closing;}
 async discardAndClose():Promise<void>{this.#retireUi();await this.#session.discardAndClose();this.#phase="closed";}
}
/** Separate explicit durable family; a stored journal takes precedence over the first-opening seed. */
export async function openSharedDocumentEditor(options:SharedDocumentEditorSessionOptions):Promise<SharedDocumentEditorSession>{
 return openDocumentEditorFamily(options,false);
}
/** Explicit search checkpoint/storage selection, retaining the same typed document UI and writer closure. */
export async function openSharedDocumentSearchEditor(options:SharedDocumentSearchEditorSessionOptions):Promise<SharedDocumentEditorSession>{
 if(options.history===undefined||options.richLanguage===undefined)throw new TypeError("Search startup requires explicit language and history policies");
 return openDocumentEditorFamily(options,true);
}
async function openDocumentEditorFamily(options:SharedDocumentEditorSessionOptions|SharedDocumentSearchEditorSessionOptions,search:boolean):Promise<SharedDocumentEditorSession>{
 options={...options};
 validateMarkdownInputPolicy(options.inputRules);
 if(options.coreOptions&&"searchHistory" in options.coreOptions&&options.coreOptions.searchHistory!==undefined)throw new TypeError("Use the separately named search startup factory");
 if(options.selectionEditing!=="document-v1")throw new TypeError("Expected explicit selectionEditing document-v1");
 if(options.rangeEditing!==undefined&&options.rangeEditing!=="general-v1")throw new TypeError("Document editing requires general-v1 ranges");
 if(options.richLanguage!==undefined&&![1,2,3].includes(options.richLanguage))throw new TypeError("Expected richLanguage 1, 2 or 3");
 if(options.readOnly!==undefined&&typeof options.readOnly!=="boolean")throw new TypeError("readOnly must be Boolean");
 if(options.history!==undefined&&options.history!=="explicit"&&options.history!=="typing-v1")throw new TypeError("Expected history explicit or typing-v1");
 const initial=structuredClone(options.initial??{kind:"empty"}) as SharedDocumentInitial|SharedSearchInitial;
 if(!(search?["resume","empty","document","frame","searchCheckpoint"]:["resume","empty","document","frame","documentCheckpoint","documentTypingCheckpoint"]).includes(initial.kind))throw new TypeError("Use an explicit matching document checkpoint discriminator");
 if(initial.kind==="documentTypingCheckpoint"&&options.history==="explicit")throw new TypeError("A document typing checkpoint requires natural history");
 const language=options.richLanguage??1,history=options.history??(initial.kind==="documentTypingCheckpoint"?"typing-v1":"explicit"),configuration=structuredClone(options.configuration??(language===3?layoutSharedProfileConfigurationV3:language===2?structuralSharedProfileConfigurationV2:standardSharedProfileConfiguration));
 const claim=claimHost(options.host,options.signal);let profile:SharedRustProfile|undefined,session:SharedPersistentSession<"document-v1">|undefined,dom:SharedDomEditor<"document-v1">|undefined;
 try{
  const runtime=await awaitInitialization(initializeSharedRuntime(options.runtimeInput),options.signal);claim.assert();
  profile=language===3?compileStandardLayoutSharedProfileV3(runtime,configuration as SharedProfileConfigurationV3):language===2?compileStandardStructuralSharedProfileV2(runtime,configuration as SharedProfileConfigurationV2):compileStandardSharedProfileV1(runtime,configuration as SharedProfileConfiguration);
  const factory=profile,binding=JSON.parse(factory.descriptor_json()) as SharedProfileDescriptor;
  if(!supportsSharedDocumentSelection(factory))throw new SharedEditorError("document_selection_unavailable","Use matching native document-family recovery before opening a durable document editor");
  if(search&&!supportsSharedSearchHistory(factory))throw new SharedEditorError("search_history_unavailable","Use matching native search recovery before opening a document search session");
  const presentation=createStandardRichInlinePresentationV1(factory.inline_catalog_json(),options.additionalInlinePresentation);
  const create=()=>{
    claim.assert();
    if(initial.kind==="resume")throw new SharedEditorError("session_missing","An exact durable document journal is required to resume this writer");
    if(initial.kind==="frame")return factory.join_frame(options.room,options.writer,initial.frame);
    if(initial.kind==="searchCheckpoint")return restoreSharedSearchEditor(factory,options.room,initial.checkpointJson);
    if(initial.kind==="documentCheckpoint"||initial.kind==="documentTypingCheckpoint")return restoreSharedDocumentEditor(factory,options.room,initial.checkpointJson,initial.kind==="documentTypingCheckpoint"?"typing-v1":"explicit");
    const block=initial.kind==="empty"?initial.blockId??crypto.randomUUID():undefined,raw=factory.create(initial.kind==="document"?initial.documentJson:emptyDocumentJson(binding,options.room,block!),options.writer);
    if(block)selectInitialCaret(raw,block);return raw;
   };
  const persistence={database:options.database,room:options.room,writer:options.writer,richLanguage:language,history,create,
   editor:{...options.coreOptions,...(options.onError?{onError:options.onError}:{})},...(options.onSaveState?{onState:options.onSaveState}:{}),...(options.onError?{onError:options.onError}:{})
  };
  session=search?await SharedPersistentSession.openSearch({...persistence,rangeEditing:"general-v1",selectionEditing:"document-v1",restoreSearch:checkpoint=>{claim.assert();return restoreSharedSearchEditor(factory,options.room,checkpoint);}}):await SharedPersistentSession.openDocument({...persistence,restore:(checkpoint,storedHistory,storedRanges="original")=>{claim.assert();return storedRanges==="general-v1"?restoreSharedGeneralEditor(factory,options.room,checkpoint,storedHistory):storedHistory==="typing-v1"?restoreSharedTypingEditor(factory,options.room,checkpoint):factory.restore(options.room,checkpoint);},restoreDocument:(checkpoint,storedHistory)=>{claim.assert();return restoreSharedDocumentEditor(factory,options.room,checkpoint,storedHistory);}});
  claim.assert();if(options.readOnly!==undefined)session.core.setReadOnly(options.readOnly);
  const core=session.core,standard=language===3?createLayoutSharedToolbarV3(core,presentation):language===2?createStructuralSharedToolbarV2(core,presentation):createStandardSharedToolbarV1(core,presentation),toolbar=options.toolbar?.(core,standard)??standard;
  const {clipboardInterchange:interchangeFactory,...domOptions}=options,interchange=clipboardInterchangeOptions(interchangeFactory,core);
  claim.assert();dom=mountSharedDocumentEditor(options.host,{...domOptions,...interchange,core,coreOwnership:"borrow",inlinePresentation:presentation,toolbar});claim.assert();return new DocumentSessionOwner(session,dom,claim.release,options);
 }catch(error){try{dom?.dispose();if(session)await session.close();}catch(closeError){throw new SharedDocumentEditorOpenError(new AggregateError([error,closeError],"Document opening and durable cleanup failed"),session!);}finally{claim.rollback();}throw error;}
 finally{profile?.free();}
}
function selectInitialCaret(raw:SharedRustOwner,block:string):void{try{const observation=raw.observe();try{const point={block,offset:"0",affinity:"after"};raw.set_selection(observation,JSON.stringify({kind:"text",anchor:point,focus:point}));}finally{observation.free();}}catch(error){raw.free();throw error;}}
