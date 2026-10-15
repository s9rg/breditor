import {compileStandardRichProfileV1,createStandardRichInlinePresentationV1,createStandardRichToolbarV1,mountRichEditor,insertImageFiles,type RichCoreEditor,type RichCoreProfile,type RichDomEditor,type RichEditorOptions,type RichCommand,type RichView,type RichCommandOutcome,type RichAssetStore,type AssetInfo,type FlowPosition,type ToolbarControl,type RenderOptions} from "@breditor/experimental-rich-content";
import {refreshAssets} from "@breditor/experimental-rich-content/rendering";
import {initializeLocalRuntime,type RuntimeInput} from "./runtime.js";
import {claimHost,awaitInitialization} from "./host.js";
import {emptyDocumentJson} from "./empty_document.js";
export const standardProfileBootstrapJson=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"breditor-editor/standard",version:1},extensions:[]});
export type LocalInitial={kind:"empty";documentId?:string;blockId?:string}|{kind:"document";documentJson:string}|{kind:"checkpoint";checkpointJson:string};
export interface LocalEditorOptions extends Omit<RichEditorOptions,"core"|"toolbar"|"inlinePresentation"|"inlineTag"> {
 host:HTMLElement;initial?:LocalInitial;profileBootstrapJson?:string;additionalInlinePresentation?:unknown;
 runtimeInput?:RuntimeInput;signal?:AbortSignal;
 /** Created for this exact owner, after native compilation and before host mutation. */
 toolbar?:(core:RichCoreEditor,standard:readonly ToolbarControl[])=>readonly ToolbarControl[];
}
export interface LocalEditor {
 readonly surface:HTMLDivElement;readonly toolbar:HTMLDivElement;readonly status:HTMLParagraphElement;
 execute(command:RichCommand,focus?:boolean,revision?:string):RichCommandOutcome|"queued";
 view():RichView;checkpointJson():string;focus():void;refreshAssets():void;
 insertImageFiles(store:RichAssetStore,files:readonly File[],position:FlowPosition):Promise<readonly AssetInfo[]>;
 dispose():void;
}
/** Headless native factory using the same original schema as the standard shared preset. */
export async function createLocalProfile(bootstrapJson=standardProfileBootstrapJson,runtimeInput?:RuntimeInput):Promise<RichCoreProfile>{
 return compileStandardRichProfileV1(await initializeLocalRuntime(runtimeInput),bootstrapJson);
}
class LocalEditorOwner implements LocalEditor {
 readonly surface:HTMLDivElement;readonly toolbar:HTMLDivElement;readonly status:HTMLParagraphElement;
 #dom:RichDomEditor;#release:()=>void;#render:RenderOptions;#disposed=false;
 constructor(dom:RichDomEditor,release:()=>void,render:RenderOptions){this.#dom=dom;this.#release=release;this.#render=render;this.surface=dom.surface;this.toolbar=dom.toolbar;this.status=dom.status;}
 execute(command:RichCommand,focus=true,revision?:string):RichCommandOutcome|"queued"{return this.#dom.execute(command,focus,revision);}
 view():RichView{return this.#dom.view();}checkpointJson():string{return this.#dom.checkpointJson();}focus():void{this.#dom.focus();}
 refreshAssets():void{this.#dom.view();refreshAssets(this.surface,this.#render);}
 insertImageFiles(store:RichAssetStore,files:readonly File[],position:FlowPosition):Promise<readonly AssetInfo[]>{return insertImageFiles(this.#dom,store,files,position);}
 dispose():void{if(this.#disposed)return;this.#disposed=true;try{this.#dom.dispose();}finally{this.#release();}}
}
/** One native local owner per host. Failed/cancelled openings retain the original host contents. */
export async function openLocalEditor(options:LocalEditorOptions):Promise<LocalEditor>{
 options={...options};const initial:LocalInitial=structuredClone(options.initial??{kind:"empty"}),claim=claimHost(options.host,options.signal);
 let profile:RichCoreProfile|undefined,core:RichCoreEditor|undefined,dom:RichDomEditor|undefined;
 try{
  const runtime=await awaitInitialization(initializeLocalRuntime(options.runtimeInput),options.signal);claim.assert();
  profile=compileStandardRichProfileV1(runtime,options.profileBootstrapJson??standardProfileBootstrapJson);
  const presentation=createStandardRichInlinePresentationV1(profile.inlineCatalogJson(),options.additionalInlinePresentation);
  const blockId=initial.kind==="empty"?initial.blockId??crypto.randomUUID():undefined;
  core=initial.kind==="checkpoint"?profile.restoreEditor(initial.checkpointJson):profile.createEditor(initial.kind==="document"?initial.documentJson:emptyDocumentJson(profile.descriptor(),initial.documentId??crypto.randomUUID(),blockId!));
  if(blockId){const point={block:blockId,offset:"0",affinity:"after" as const};core.execute({kind:"setSelection",selection:{kind:"text",anchor:point,focus:point}});}
  const toolbar=options.toolbar?.(core,createStandardRichToolbarV1(core,presentation))??createStandardRichToolbarV1(core,presentation);
  const render:RenderOptions={inlinePresentation:presentation,...(options.resolveAsset?{resolveAsset:options.resolveAsset}:{})};
  claim.assert();dom=mountRichEditor(options.host,{...options,core,...render,toolbar});claim.assert();
  return new LocalEditorOwner(dom,claim.release,render);
 }catch(error){try{if(dom)dom.dispose();else core?.dispose();}finally{claim.rollback();}throw error;}
 finally{profile?.dispose();}
}
