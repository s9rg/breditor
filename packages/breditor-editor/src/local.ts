import {compileStandardRichProfileV1,compileStandardStructuralRichProfileV2,createStandardRichInlinePresentationV1,createStandardRichToolbarV1,createStructuralRichToolbarV2,mountRichEditor,insertImageFiles,type RichCoreEditor,type RichCoreProfile,type RichDomEditor,type RichEditorOptions,type RichCommand,type RichView,type RichCommandOutcome,type RichAssetStore,type AssetInfo,type FlowPosition,type ToolbarControl,type RenderOptions} from "@breditor/experimental-rich-content";
import {refreshAssets} from "@breditor/experimental-rich-content/rendering";
import {initializeLocalRuntime,type RuntimeInput} from "./runtime.js";
import {claimHost,awaitInitialization} from "./host.js";
import {emptyDocumentJson} from "./empty_document.js";
export const standardProfileBootstrapJson=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"breditor-editor/standard",version:1},extensions:[]});
/** Explicit bootstrap V7; neither old schema selectors nor saved checkpoints migrate. */
export const structuralProfileBootstrapJsonV2=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:7,schema:{name:"breditor-editor/standard",version:2},extensions:[]});
export type LocalInitial={kind:"empty";documentId?:string;blockId?:string}|{kind:"document";documentJson:string}|{kind:"checkpoint";checkpointJson:string}|{kind:"typingCheckpoint";checkpointJson:string};
export interface LocalEditorOptions extends Omit<RichEditorOptions,"core"|"toolbar"|"inlinePresentation"|"inlineTag"> {
 host:HTMLElement;initial?:LocalInitial;profileBootstrapJson?:string;additionalInlinePresentation?:unknown;
 /** Explicit local structural grammar; omitted/1 preserves all V1 defaults. */
 richLanguage?:1|2;
 /** Initial live host policy, reapplied after checkpoint restore; not serialized permission. */
 readOnly?:boolean;
 /** Immutable native history policy; omitted/explicit preserves existing defaults. */
 history?:"explicit"|"typing-v1";
 runtimeInput?:RuntimeInput;signal?:AbortSignal;
 /** Created for this exact owner, after native compilation and before host mutation. */
 toolbar?:(core:RichCoreEditor,standard:readonly ToolbarControl[])=>readonly ToolbarControl[];
}
export interface LocalEditor {
 readonly surface:HTMLDivElement;readonly toolbar:HTMLDivElement;readonly status:HTMLParagraphElement;
 execute(command:RichCommand,focus?:boolean,revision?:string):RichCommandOutcome|"queued";
 view():RichView;checkpointJson():string;focus():void;refreshAssets():void;
 setReadOnly(value:boolean,revision?:string):boolean;
 closeTypingGroup(revision?:string):boolean;
 insertImageFiles(store:RichAssetStore,files:readonly File[],position:FlowPosition):Promise<readonly AssetInfo[]>;
 dispose():void;
}
/** Headless native factory using the same original schema as the standard shared preset. */
export async function createLocalProfile(bootstrapJson=standardProfileBootstrapJson,runtimeInput?:RuntimeInput):Promise<RichCoreProfile>{
 return compileStandardRichProfileV1(await initializeLocalRuntime(runtimeInput),bootstrapJson);
}
/** Headless structural V2 factory; uses bootstrap V7 and a distinct native fingerprint. */
export async function createStructuralLocalProfileV2(bootstrapJson=structuralProfileBootstrapJsonV2,runtimeInput?:RuntimeInput):Promise<RichCoreProfile>{
 return compileStandardStructuralRichProfileV2(await initializeLocalRuntime(runtimeInput),bootstrapJson);
}
class LocalEditorOwner implements LocalEditor {
 readonly surface:HTMLDivElement;readonly toolbar:HTMLDivElement;readonly status:HTMLParagraphElement;
 #dom:RichDomEditor;#release:()=>void;#render:RenderOptions;#disposed=false;
 constructor(dom:RichDomEditor,release:()=>void,render:RenderOptions){this.#dom=dom;this.#release=release;this.#render=render;this.surface=dom.surface;this.toolbar=dom.toolbar;this.status=dom.status;}
 execute(command:RichCommand,focus=true,revision?:string):RichCommandOutcome|"queued"{return this.#dom.execute(command,focus,revision);}
 view():RichView{return this.#dom.view();}checkpointJson():string{return this.#dom.checkpointJson();}focus():void{this.#dom.focus();}
 refreshAssets():void{this.#dom.view();refreshAssets(this.surface,this.#render);}
 setReadOnly(value:boolean,revision?:string):boolean{return this.#dom.setReadOnly(value,revision);}
 closeTypingGroup(revision?:string):boolean{return this.#dom.closeTypingGroup(revision);}
 insertImageFiles(store:RichAssetStore,files:readonly File[],position:FlowPosition):Promise<readonly AssetInfo[]>{return insertImageFiles(this.#dom,store,files,position);}
 dispose():void{if(this.#disposed)return;this.#disposed=true;try{this.#dom.dispose();}finally{this.#release();}}
}
/** One native local owner per host. Failed/cancelled openings retain the original host contents. */
export async function openLocalEditor(options:LocalEditorOptions):Promise<LocalEditor>{
 options={...options};
 if(options.richLanguage!==undefined&&options.richLanguage!==1&&options.richLanguage!==2)throw new TypeError("Expected richLanguage 1 or 2");
 if(options.readOnly!==undefined&&typeof options.readOnly!=="boolean")throw new TypeError("readOnly must be Boolean");
 if(options.history!==undefined&&options.history!=="explicit"&&options.history!=="typing-v1")throw new TypeError("Expected history explicit or typing-v1");
 if(options.initial?.kind==="typingCheckpoint"&&options.history==="explicit")throw new TypeError("A typing checkpoint requires its declared natural history policy");
 const initial:LocalInitial=structuredClone(options.initial??{kind:"empty"}),claim=claimHost(options.host,options.signal);
 let profile:RichCoreProfile|undefined,core:RichCoreEditor|undefined,dom:RichDomEditor|undefined;
 try{
  const runtime=await awaitInitialization(initializeLocalRuntime(options.runtimeInput),options.signal);claim.assert();
  const structural=options.richLanguage===2;
  profile=structural?compileStandardStructuralRichProfileV2(runtime,options.profileBootstrapJson??structuralProfileBootstrapJsonV2):compileStandardRichProfileV1(runtime,options.profileBootstrapJson??standardProfileBootstrapJson);
  const presentation=createStandardRichInlinePresentationV1(profile.inlineCatalogJson(),options.additionalInlinePresentation);
  const blockId=initial.kind==="empty"?initial.blockId??crypto.randomUUID():undefined;
  if(initial.kind==="typingCheckpoint"){
   if(profile.supportsTypingHistory?.()!==true||!profile.restoreTypingEditor)throw Error("Use matching native typing-history recovery");
   core=profile.restoreTypingEditor(initial.checkpointJson);
  }else core=initial.kind==="checkpoint"?profile.restoreEditor(initial.checkpointJson):profile.createEditor(initial.kind==="document"?initial.documentJson:emptyDocumentJson(profile.descriptor(),initial.documentId??crypto.randomUUID(),blockId!));
  if(blockId){const point={block:blockId,offset:"0",affinity:"after" as const};core.execute({kind:"setSelection",selection:{kind:"text",anchor:point,focus:point}});}
  if(options.history==="typing-v1"||initial.kind==="typingCheckpoint"){
   if(core.supportsTypingHistory?.()!==true||!core.enableTypingHistory)throw Error("Use matching native typing history");
   core.enableTypingHistory();
  }
  if(options.readOnly!==undefined){if(core.supportsReadOnly?.()!==true||!core.setReadOnly)throw Error("Use a matching native owner with read-only enforcement");core.setReadOnly(options.readOnly);}
  const standard=structural?createStructuralRichToolbarV2(core,presentation):createStandardRichToolbarV1(core,presentation);
  const toolbar=options.toolbar?.(core,standard)??standard;
  const render:RenderOptions={inlinePresentation:presentation,...(options.resolveAsset?{resolveAsset:options.resolveAsset}:{})};
  claim.assert();dom=mountRichEditor(options.host,{...options,core,...render,toolbar});claim.assert();
  return new LocalEditorOwner(dom,claim.release,render);
 }catch(error){try{if(dom)dom.dispose();else core?.dispose();}finally{claim.rollback();}throw error;}
 finally{profile?.dispose();}
}
