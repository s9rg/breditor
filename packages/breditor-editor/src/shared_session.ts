import {
 compileStandardSharedProfileV1,compileStandardStructuralSharedProfileV2,compileStandardLayoutSharedProfileV3,restoreSharedTypingEditor,restoreSharedGeneralEditor,supportsSharedGeneralRanges,SharedPersistentSession,SharedEditorError,mountSharedEditor,createStandardSharedToolbarV1,createStructuralSharedToolbarV2,createLayoutSharedToolbarV3,
 type SharedRustProfile,type SharedProfileConfiguration,type SharedProfileConfigurationV2,type SharedProfileConfigurationV3,type SharedProfileDescriptor,
 type SharedDomEditor,type SharedDomOptions,type SharedRichEditor,type SharedToolbarControl,
 type SharedDispatch,type SharedSaveState,type SharedRustOwner,type SharedRangePolicy,type SharedEditorOptions as SharedCoreOptions
} from "@breditor/collaboration";
import {createStandardRichInlinePresentationV1} from "@breditor/experimental-rich-content";
import type {RichSearchHost} from "@breditor/experimental-rich-content";
import type {SharedSearchResults} from "@breditor/collaboration";
import {supportsSharedSearchHistory,restoreSharedSearchEditor} from "@breditor/collaboration";
import {initializeSharedRuntime,standardSharedProfileConfiguration,structuralSharedProfileConfigurationV2,layoutSharedProfileConfigurationV3} from "./shared_profile.js";
import {claimHost,awaitInitialization} from "./host.js";
import {emptyDocumentJson} from "./empty_document.js";
import {clipboardInterchangeOptions,type ClipboardInterchangeFactory} from "./clipboard_interchange.js";
import type {RuntimeInput} from "./runtime_loader.js";
import {SharedEditorOpenError,type SharedEditorRecovery} from "./shared_open_error.js";
export {SharedEditorOpenError,type SharedEditorRecovery} from "./shared_open_error.js";

/** A durable journal, if present, always takes precedence over this first-opening seed. */
export type SharedInitial=
 |{kind:"resume"}
 |{kind:"empty";blockId?:string}
 |{kind:"document";documentJson:string}
 |{kind:"frame";frame:string}
 |{kind:"checkpoint";checkpointJson:string}
 |{kind:"typingCheckpoint";checkpointJson:string}
 |{kind:"generalCheckpoint";checkpointJson:string}
 |{kind:"generalTypingCheckpoint";checkpointJson:string};
/** Explicit new first-opening checkpoint tag. Existing durable keys are never inferred or migrated. */
export type SharedSearchInitial=Extract<SharedInitial,{kind:"resume"|"empty"|"document"|"frame"}>|{kind:"searchCheckpoint";checkpointJson:string};

export interface SharedEditorSessionOptions extends Omit<SharedDomOptions,"core"|"coreOwnership"|"toolbar"|"inlinePresentation"|"inlineTag"|"clipboardInterchange"> {
 host:HTMLElement;database:string;room:string;writer:string;initial?:SharedInitial;
 configuration?:SharedProfileConfiguration|SharedProfileConfigurationV2|SharedProfileConfigurationV3;additionalInlinePresentation?:unknown;
 /** Explicit native language. Omitted/1 retains original model11; 3 selects layout model13. */
 richLanguage?:1|2|3;
 readOnly?:boolean;
 /** Immutable native history policy; omitted/explicit preserves existing defaults. */
 history?:"explicit"|"typing-v1";
 /** Explicit general replay/routing policy; never inferred from opaque checkpoint JSON. */
 rangeEditing?:SharedRangePolicy;
 runtimeInput?:RuntimeInput;signal?:AbortSignal;coreOptions?:Omit<SharedCoreOptions,"onError"|"searchHistory">;
 onSaveState?:(state:SharedSaveState)=>void;
 /** Stop borrowed relay/presence/asset adapters before the native writer retires. Reporting errors cannot cancel close. */
 onClosing?:(editor:SharedEditorSession)=>void;
 /** Configuration only: do not publish edits from a toolbar factory. */
 toolbar?:(core:SharedRichEditor,standard:readonly SharedToolbarControl[])=>readonly SharedToolbarControl[];
 /** Configuration only, against this durable native owner before mounting. */
 clipboardInterchange?:ClipboardInterchangeFactory<SharedRichEditor>;
}
export interface SharedSearchEditorSessionOptions extends Omit<SharedEditorSessionOptions,"initial"|"history"|"rangeEditing"|"richLanguage"> {
 initial?:SharedSearchInitial;history:"explicit"|"typing-v1";rangeEditing:SharedRangePolicy;richLanguage:1|2|3;
}

/** Owns UI, exact local durability and the exclusive causal writer; transport remains optional. */
export interface SharedEditorSession extends SharedEditorRecovery {
 readonly surface:HTMLDivElement;readonly toolbar:HTMLDivElement;readonly status:HTMLParagraphElement;readonly recovered:boolean;
 /** Borrow for relay/presence integration. Do not dispose it or mutate it after close begins. */
 readonly core:SharedRichEditor;
 execute(request:SharedDispatch,focus?:boolean,revision?:string):void;
 select(...args:Parameters<SharedDomEditor["select"]>):void;
 focus():void;refreshAssets():void;
 setReadOnly(value:boolean,revision?:string):boolean;
 closeTypingGroup(revision?:string):boolean;
 search():RichSearchHost<SharedSearchResults>;
 rangePolicy():SharedRangePolicy;
 view():ReturnType<SharedRichEditor["view"]>;checkpointJson():string;state():SharedSaveState;
 flush():Promise<void>;retrySave():Promise<void>;
 /** Stops UI immediately. Failed saves retain the owner/lease for retry, never implicit discard. */
 close():Promise<void>;
 /** Explicitly abandon unsaved memory without deleting the last durable journal. */
 discardAndClose():Promise<void>;
}
class SharedEditorSessionOwner implements SharedEditorSession {
 readonly surface:HTMLDivElement;readonly toolbar:HTMLDivElement;readonly status:HTMLParagraphElement;
 readonly recovered:boolean;readonly core:SharedRichEditor;
 #session:SharedPersistentSession;#dom:SharedDomEditor;#release:()=>void;
 #phase:"active"|"closing"|"closed"="active";#closing:Promise<void>|undefined;
 #onClosing:SharedEditorSessionOptions["onClosing"];#onError:SharedEditorSessionOptions["onError"];
 constructor(session:SharedPersistentSession,dom:SharedDomEditor,release:()=>void,options:Pick<SharedEditorSessionOptions,"onClosing"|"onError">){
  this.#session=session;this.#dom=dom;this.#release=release;this.core=session.core;this.recovered=session.recovered;
  this.surface=dom.surface;this.toolbar=dom.toolbar;this.status=dom.status;
  this.#onClosing=options.onClosing;this.#onError=options.onError;
 }
 #active():void{if(this.#phase!=="active")throw Error("The shared editor is closing or closed");}
 execute(request:SharedDispatch,focus=true,revision?:string):void{this.#active();this.#dom.execute(request,focus,revision);}
 select(...args:Parameters<SharedDomEditor["select"]>):void{this.#active();this.#dom.select(...args);}
 focus():void{this.#active();this.#dom.focus();}
 refreshAssets():void{this.#active();this.#dom.refreshAssets();}
 setReadOnly(value:boolean,revision?:string):boolean{this.#active();return this.#dom.setReadOnly(value,revision);}
 closeTypingGroup(revision?:string):boolean{this.#active();return this.#dom.closeTypingGroup(revision);}
 search():RichSearchHost<SharedSearchResults>{this.#active();return this.#dom;}
 historyPolicy():"explicit"|"typing-v1"{return this.core.view().historyGrouping==="typing-v1"?"typing-v1":"explicit";}
 rangePolicy():SharedRangePolicy{return this.core.view().rangeEditing??"original";}
 searchHistoryPolicy():"search-v1"|null{return this.core.searchHistoryPolicy();}
 view():ReturnType<SharedRichEditor["view"]>{return this.core.view();}
 checkpointJson():string{return this.core.checkpointJson();}
 state():SharedSaveState{return this.#session.state();}
 flush():Promise<void>{return this.#session.flush();}
 retrySave():Promise<void>{return this.#session.retry();}
 #retireUi():void{
  if(this.#phase!=="active")return;this.#phase="closing";
  this.surface.contentEditable="false";
  try{this.#onClosing?.(this);}catch(error){try{this.#onError?.(error);}catch{/* Reporting cannot prevent durable retirement. */}}
  try{this.#dom.dispose();}finally{this.#release();}
 }
 /** Stop UI immediately, then save and release. A failed close keeps the native owner/lease for retry. */
 close():Promise<void>{
  if(this.#closing)return this.#closing;
  if(this.#phase==="closed")return Promise.resolve();
  this.#retireUi();
  this.#closing=this.#session.close().then(()=>{this.#phase="closed";}).finally(()=>{this.#closing=undefined;});
  return this.#closing;
 }
 /** Explicit loss of unsaved memory only; the last durable journal is never deleted. */
 async discardAndClose():Promise<void>{this.#retireUi();await this.#session.discardAndClose();this.#phase="closed";}
}

/** Open one exact persistent writer. Cancelling initialization does not cancel another consumer's Wasm. */
export async function openSharedEditor(options:SharedEditorSessionOptions):Promise<SharedEditorSession>{
 return openSharedEditorFamily(options,false);
}
/** Separate exact search replay family. The host explicitly chooses language, ranges and grouping. */
export async function openSharedSearchEditor(options:SharedSearchEditorSessionOptions):Promise<SharedEditorSession>{
 if(options.history===undefined||options.rangeEditing===undefined||options.richLanguage===undefined)throw new TypeError("Search startup requires explicit language, range and history policies");
 return openSharedEditorFamily(options,true);
}
async function openSharedEditorFamily(options:SharedEditorSessionOptions|SharedSearchEditorSessionOptions,search:boolean):Promise<SharedEditorSession>{
 options={...options};
 if(options.coreOptions&&"searchHistory" in options.coreOptions&&options.coreOptions.searchHistory!==undefined)throw new TypeError("Use the separately named search startup factory");
 if(options.richLanguage!==undefined&&options.richLanguage!==1&&options.richLanguage!==2&&options.richLanguage!==3)throw new TypeError("Expected richLanguage 1, 2 or 3");
 if(options.readOnly!==undefined&&typeof options.readOnly!=="boolean")throw new TypeError("readOnly must be Boolean");
 if(options.history!==undefined&&options.history!=="explicit"&&options.history!=="typing-v1")throw new TypeError("Expected history explicit or typing-v1");
 if(options.rangeEditing!==undefined&&options.rangeEditing!=="original"&&options.rangeEditing!=="general-v1")throw new TypeError("Expected rangeEditing original or general-v1");
 if((options.initial?.kind==="typingCheckpoint"||options.initial?.kind==="generalTypingCheckpoint")&&options.history==="explicit")throw new TypeError("A typing checkpoint requires its declared natural history policy");
 if((options.initial?.kind==="generalCheckpoint"||options.initial?.kind==="generalTypingCheckpoint")&&options.rangeEditing==="original")throw new TypeError("A general checkpoint requires its declared general-v1 range policy");
 const language=options.richLanguage??1;
 const initial=structuredClone(options.initial??{kind:"empty"}) as SharedInitial|SharedSearchInitial;
 if(!(search?["resume","empty","document","frame","searchCheckpoint"]:["resume","empty","document","frame","checkpoint","typingCheckpoint","generalCheckpoint","generalTypingCheckpoint"]).includes(initial.kind))throw new TypeError("Use the matching explicitly selected shared checkpoint discriminator");
 const history=options.history??(initial.kind==="typingCheckpoint"||initial.kind==="generalTypingCheckpoint"?"typing-v1":"explicit");
 const ranges=options.rangeEditing??(initial.kind==="generalCheckpoint"||initial.kind==="generalTypingCheckpoint"?"general-v1":"original");
 const configuration=structuredClone(options.configuration??(language===3?layoutSharedProfileConfigurationV3:language===2?structuralSharedProfileConfigurationV2:standardSharedProfileConfiguration));
 const claim=claimHost(options.host,options.signal);
 let profile:SharedRustProfile|undefined,session:SharedPersistentSession|undefined,dom:SharedDomEditor|undefined;
 try{
  const runtime=await awaitInitialization(initializeSharedRuntime(options.runtimeInput),options.signal);claim.assert();
  profile=language===3?compileStandardLayoutSharedProfileV3(runtime,configuration as SharedProfileConfigurationV3):language===2?compileStandardStructuralSharedProfileV2(runtime,configuration as SharedProfileConfigurationV2):compileStandardSharedProfileV1(runtime,configuration as SharedProfileConfiguration);
  const factory=profile,binding=JSON.parse(factory.descriptor_json()) as SharedProfileDescriptor;
  if(ranges==="general-v1"&&!supportsSharedGeneralRanges(factory))throw new SharedEditorError("general_range_unavailable","Use matching native general-range recovery before opening a durable general session");
  if(search&&!supportsSharedSearchHistory(factory))throw new SharedEditorError("search_history_unavailable","Use matching native search recovery before opening a search session");
  const presentation=createStandardRichInlinePresentationV1(factory.inline_catalog_json(),options.additionalInlinePresentation);
  const create=()=>{
    claim.assert();
    if(initial.kind==="resume")throw new SharedEditorError("session_missing","An exact durable shared journal is required to resume this writer");
    if(initial.kind==="frame")return factory.join_frame(options.room,options.writer,initial.frame);
    if(initial.kind==="searchCheckpoint")return restoreSharedSearchEditor(factory,options.room,initial.checkpointJson);
    if(initial.kind==="checkpoint")return factory.restore(options.room,initial.checkpointJson);
    if(initial.kind==="typingCheckpoint")return restoreSharedTypingEditor(factory,options.room,initial.checkpointJson);
    if(initial.kind==="generalCheckpoint"||initial.kind==="generalTypingCheckpoint")return restoreSharedGeneralEditor(factory,options.room,initial.checkpointJson,initial.kind==="generalTypingCheckpoint"?"typing-v1":"explicit");
    const block=initial.kind==="empty"?initial.blockId??crypto.randomUUID():undefined;
    const raw=factory.create(initial.kind==="document"?initial.documentJson:emptyDocumentJson(binding,options.room,block!),options.writer);
    if(block)selectInitialCaret(raw,block);
    return raw;
   };
  const persistence={database:options.database,room:options.room,writer:options.writer,richLanguage:language,history,create,
   editor:{...options.coreOptions,...(options.onError?{onError:options.onError}:{})},
   ...(options.onSaveState?{onState:options.onSaveState}:{}),...(options.onError?{onError:options.onError}:{})
  };
  session=search?await SharedPersistentSession.openSearch({...persistence,rangeEditing:ranges,selectionEditing:"original",restoreSearch:checkpoint=>{claim.assert();return restoreSharedSearchEditor(factory,options.room,checkpoint);}}):await SharedPersistentSession.open({...persistence,...(ranges==="general-v1"?{rangeEditing:ranges}:{}),restore:(checkpoint,storedHistory,storedRanges="original")=>{claim.assert();return storedRanges==="general-v1"?restoreSharedGeneralEditor(factory,options.room,checkpoint,storedHistory):storedHistory==="typing-v1"?restoreSharedTypingEditor(factory,options.room,checkpoint):factory.restore(options.room,checkpoint);}});
  claim.assert();
  if(options.readOnly!==undefined)session.core.setReadOnly(options.readOnly);
  const core=session.core,standard=language===3?createLayoutSharedToolbarV3(core,presentation):language===2?createStructuralSharedToolbarV2(core,presentation):createStandardSharedToolbarV1(core,presentation),toolbar=options.toolbar?.(core,standard)??standard;
  const {clipboardInterchange:interchangeFactory,...domOptions}=options,interchange=clipboardInterchangeOptions(interchangeFactory,core);
  claim.assert();dom=mountSharedEditor(options.host,{...domOptions,...interchange,core,coreOwnership:"borrow",inlinePresentation:presentation,toolbar});claim.assert();
  return new SharedEditorSessionOwner(session,dom,claim.release,options);
 }catch(error){
  try{dom?.dispose();if(session)await session.close();}
  catch(closeError){throw new SharedEditorOpenError(new AggregateError([error,closeError],"Opening and durable cleanup failed"),session!);}
  finally{claim.rollback();}
  throw error;
 }finally{profile?.free();}
}

/** Prepare a fresh empty writer before its first exact save, using the native opaque observation. */
function selectInitialCaret(raw:SharedRustOwner,block:string):void{
 try{
  const observation=raw.observe();
  try{const point={block,offset:"0",affinity:"after"};raw.set_selection(observation,JSON.stringify({kind:"text",anchor:point,focus:point}));}
  finally{observation.free();}
 }catch(error){raw.free();throw error;}
}
