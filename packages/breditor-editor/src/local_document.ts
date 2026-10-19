/** Explicit document-family SDK owner. Original local startup and checkpoint discriminators stay closed. */
import {compileStandardRichProfileV1,compileStandardStructuralRichProfileV2,compileStandardLayoutRichProfileV3,createStandardRichInlinePresentationV1,createStandardRichToolbarV1,createStructuralRichToolbarV2,createLayoutRichToolbarV3,mountDocumentRichEditor,type RichCoreProfile,type RichDocumentCoreEditor,type RichDocumentEditorOptions,type RichDomEditor,type RichDocumentView,type ToolbarControl,type RenderOptions} from "@breditor/experimental-rich-content";
import {refreshAssets,validateMarkdownInputPolicy} from "@breditor/experimental-rich-content/rendering";
import type {RichSearchHost} from "@breditor/experimental-rich-content";
import {initializeLocalRuntime} from "./runtime.js";
import {claimHost,awaitInitialization} from "./host.js";
import {emptyDocumentJson} from "./empty_document.js";
import {clipboardInterchangeOptions,type ClipboardInterchangeFactory} from "./clipboard_interchange.js";
import {standardProfileBootstrapJson,structuralProfileBootstrapJsonV2,layoutProfileBootstrapJsonV3,type LocalEditor,type LocalEditorOptions,type LocalInitial} from "./local.js";

export type LocalDocumentInitial=Extract<LocalInitial,{kind:"empty"|"document"}>
 |{kind:"documentCheckpoint";checkpointJson:string}
 |{kind:"documentTypingCheckpoint";checkpointJson:string};
export interface LocalDocumentEditorOptions extends Omit<RichDocumentEditorOptions,"core"|"toolbar"|"inlinePresentation"|"inlineTag"|"clipboardInterchange">,Pick<LocalEditorOptions,"host"|"profileBootstrapJson"|"additionalInlinePresentation"|"richLanguage"|"readOnly"|"history"|"runtimeInput"|"signal"> {
 initial?:LocalDocumentInitial;
 /** Runs against the actual typed native document owner before host mutation. */
 toolbar?:(core:RichDocumentCoreEditor,standard:readonly ToolbarControl<"document-v1">[])=>readonly ToolbarControl<"document-v1">[];
 clipboardInterchange?:ClipboardInterchangeFactory<RichDocumentCoreEditor>;
}
export interface LocalDocumentEditor extends Omit<LocalEditor,"view"|"insertImageFiles"> {
 selectionPolicy():"document-v1";
 view():RichDocumentView;
 selectDocument(...args:Parameters<RichDomEditor<"document-v1">["selectDocument"]>):ReturnType<RichDomEditor<"document-v1">["selectDocument"]>;
 replaceDocumentPlainText(...args:Parameters<RichDomEditor<"document-v1">["replaceDocumentPlainText"]>):ReturnType<RichDomEditor<"document-v1">["replaceDocumentPlainText"]>;
 pasteDocumentClipboard(...args:Parameters<RichDomEditor<"document-v1">["pasteDocumentClipboard"]>):ReturnType<RichDomEditor<"document-v1">["pasteDocumentClipboard"]>;
 collapseDocumentSelection(...args:Parameters<RichDomEditor<"document-v1">["collapseDocumentSelection"]>):ReturnType<RichDomEditor<"document-v1">["collapseDocumentSelection"]>;
}
class DocumentOwner implements LocalDocumentEditor {
 readonly surface:HTMLDivElement;readonly toolbar:HTMLDivElement;readonly status:HTMLParagraphElement;
 #dom:RichDomEditor<"document-v1">;#release:()=>void;#render:RenderOptions;#disposed=false;
 constructor(dom:RichDomEditor<"document-v1">,release:()=>void,render:RenderOptions){this.#dom=dom;this.#release=release;this.#render=render;this.surface=dom.surface;this.toolbar=dom.toolbar;this.status=dom.status;}
 selectionPolicy():"document-v1"{return "document-v1";}
 execute(...args:Parameters<LocalDocumentEditor["execute"]>):ReturnType<LocalDocumentEditor["execute"]>{return this.#dom.execute(...args);}
 view():RichDocumentView{return this.#dom.view();}checkpointJson():string{return this.#dom.checkpointJson();}
 focus():void{this.#dom.focus();}refreshAssets():void{this.#dom.view();refreshAssets(this.surface,this.#render);}
 setReadOnly(...args:Parameters<LocalDocumentEditor["setReadOnly"]>):boolean{return this.#dom.setReadOnly(...args);}
 closeTypingGroup(...args:Parameters<LocalDocumentEditor["closeTypingGroup"]>):boolean{return this.#dom.closeTypingGroup(...args);}
 search():RichSearchHost{this.#dom.view();return this.#dom;}
 writing():import("@breditor/experimental-rich-content").RichWritingToolsHost{this.#dom.view();return this.#dom;}
 selectDocument(...args:Parameters<LocalDocumentEditor["selectDocument"]>):ReturnType<LocalDocumentEditor["selectDocument"]>{return this.#dom.selectDocument(...args);}
 replaceDocumentPlainText(...args:Parameters<LocalDocumentEditor["replaceDocumentPlainText"]>):ReturnType<LocalDocumentEditor["replaceDocumentPlainText"]>{return this.#dom.replaceDocumentPlainText(...args);}
 pasteDocumentClipboard(...args:Parameters<LocalDocumentEditor["pasteDocumentClipboard"]>):ReturnType<LocalDocumentEditor["pasteDocumentClipboard"]>{return this.#dom.pasteDocumentClipboard(...args);}
 collapseDocumentSelection(...args:Parameters<LocalDocumentEditor["collapseDocumentSelection"]>):ReturnType<LocalDocumentEditor["collapseDocumentSelection"]>{return this.#dom.collapseDocumentSelection(...args);}
 dispose():void{if(this.#disposed)return;this.#disposed=true;try{this.#dom.dispose();}finally{this.#release();}}
}
/** One explicit document owner per host; rollback preserves the original nodes on failed/cancelled startup. */
export async function openLocalDocumentEditor(options:LocalDocumentEditorOptions):Promise<LocalDocumentEditor>{
 options={...options};
 validateMarkdownInputPolicy(options.inputRules);
 if(options.selectionEditing!=="document-v1")throw new TypeError("Expected explicit selectionEditing document-v1");
 if(options.rangeEditing!==undefined&&options.rangeEditing!=="general-v1")throw new TypeError("Document editing requires general-v1 ranges");
 if(options.richLanguage!==undefined&&![1,2,3].includes(options.richLanguage))throw new TypeError("Expected richLanguage 1, 2 or 3");
 if(options.readOnly!==undefined&&typeof options.readOnly!=="boolean")throw new TypeError("readOnly must be Boolean");
 if(options.history!==undefined&&options.history!=="explicit"&&options.history!=="typing-v1")throw new TypeError("Expected history explicit or typing-v1");
 const initial=structuredClone(options.initial??{kind:"empty"}) as LocalDocumentInitial;
 if(!["empty","document","documentCheckpoint","documentTypingCheckpoint"].includes(initial.kind))throw new TypeError("Use an explicit document checkpoint discriminator");
 if(initial.kind==="documentTypingCheckpoint"&&options.history==="explicit")throw new TypeError("A document typing checkpoint requires natural history");
 const claim=claimHost(options.host,options.signal);let profile:RichCoreProfile|undefined,core:RichDocumentCoreEditor|undefined,dom:RichDomEditor<"document-v1">|undefined;
 try{
  const runtime=await awaitInitialization(initializeLocalRuntime(options.runtimeInput),options.signal);claim.assert();const language=options.richLanguage??1;
  profile=language===3?compileStandardLayoutRichProfileV3(runtime,options.profileBootstrapJson??layoutProfileBootstrapJsonV3):language===2?compileStandardStructuralRichProfileV2(runtime,options.profileBootstrapJson??structuralProfileBootstrapJsonV2):compileStandardRichProfileV1(runtime,options.profileBootstrapJson??standardProfileBootstrapJson);
  if(profile.supportsDocumentSelection?.()!==true||!profile.createDocumentEditor||!profile.restoreDocumentEditor||!profile.restoreDocumentTypingEditor)throw Error("Use matching native document-family creation and recovery");
  const presentation=createStandardRichInlinePresentationV1(profile.inlineCatalogJson(),options.additionalInlinePresentation),block=initial.kind==="empty"?initial.blockId??crypto.randomUUID():undefined;
  core=initial.kind==="documentCheckpoint"?profile.restoreDocumentEditor(initial.checkpointJson):initial.kind==="documentTypingCheckpoint"?profile.restoreDocumentTypingEditor(initial.checkpointJson):profile.createDocumentEditor(initial.kind==="document"?initial.documentJson:emptyDocumentJson(profile.descriptor(),initial.documentId??crypto.randomUUID(),block!));
  if(block){const point={block,offset:"0",affinity:"after" as const};core.execute({kind:"setSelection",selection:{kind:"text",anchor:point,focus:point}});}
  const history=options.history??(initial.kind==="documentTypingCheckpoint"?"typing-v1":"explicit");
  if(history==="typing-v1"){if(core.supportsTypingHistory?.()!==true||!core.enableTypingHistory)throw Error("Use matching native document typing history");core.enableTypingHistory();}
  else if(core.view().historyGrouping!==undefined)throw Error("Explicit history cannot flatten a document typing checkpoint");
  if(options.readOnly!==undefined){if(core.supportsReadOnly?.()!==true||!core.setReadOnly)throw Error("Use matching native read-only enforcement");core.setReadOnly(options.readOnly);}
  const standard=language===3?createLayoutRichToolbarV3(core,presentation):language===2?createStructuralRichToolbarV2(core,presentation):createStandardRichToolbarV1(core,presentation),toolbar=options.toolbar?.(core,standard)??standard;
  const render:RenderOptions={inlinePresentation:presentation,...(options.resolveAsset?{resolveAsset:options.resolveAsset}:{})};
  const {clipboardInterchange:factory,...domOptions}=options,interchange=clipboardInterchangeOptions(factory,core);
  claim.assert();dom=mountDocumentRichEditor(options.host,{...domOptions,...interchange,core,...render,toolbar});claim.assert();return new DocumentOwner(dom,claim.release,render);
 }catch(error){try{if(dom)dom.dispose();else core?.dispose();}finally{claim.rollback();}throw error;}
 finally{profile?.dispose();}
}
