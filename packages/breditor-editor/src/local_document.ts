/** Explicit document-family SDK owner. Original local startup and checkpoint discriminators stay closed. */
import {validatePlaceholderOption,resolveRichUi} from "@breditor/experimental-rich-content/rendering";
import {createStandardRichInlinePresentationV1,mountDocumentRichEditor,type RichCoreProfile,type RichDocumentCoreEditor,type RichDocumentEditorOptions,type RichDomEditor,type RichDocumentView,type ToolbarControl,type RenderOptions} from "@breditor/experimental-rich-content";
import {refreshAssets,validateMarkdownInputPolicy} from "@breditor/experimental-rich-content/rendering";
import type {RichSearchHost} from "@breditor/experimental-rich-content";
import {initializeLocalRuntime} from "./runtime.js";
import {claimHost,awaitInitialization} from "./host.js";
import {emptyDocumentJson} from "./empty_document.js";
import {clipboardInterchangeOptions,type ClipboardInterchangeFactory} from "./clipboard_interchange.js";
import {checkLocalRichLanguage,compileLocalLanguageProfile,localLanguageToolbar,type LocalEditor,type LocalEditorOptions,type LocalInitial} from "./local.js";
import {checkCrashRecoveryOptions,CrashSupervisor,type CrashRecoveryOptions} from "./crash_recovery.js";
import {RecoverableDocumentOwner,type RecoverableLocalDocumentEditor,type RecoveryPolicy} from "./crash_recovery_owner.js";

export type LocalDocumentInitial=Extract<LocalInitial,{kind:"empty"|"document"}>
 |{kind:"documentCheckpoint";checkpointJson:string}
 |{kind:"documentTypingCheckpoint";checkpointJson:string};
export interface LocalDocumentEditorOptions extends Omit<RichDocumentEditorOptions,"core"|"toolbar"|"inlinePresentation"|"inlineTag"|"clipboardInterchange">,Pick<LocalEditorOptions,"host"|"profileBootstrapJson"|"additionalInlinePresentation"|"richLanguage"|"readOnly"|"history"|"runtimeInput"|"signal"|"crashRecovery"> {
 initial?:LocalDocumentInitial;
 /** Runs against the actual typed native document owner before host mutation. */
 toolbar?:(core:RichDocumentCoreEditor,standard:readonly ToolbarControl<"document-v1">[],presentation:import("@breditor/experimental-rich-content").RichInlinePresentation)=>readonly ToolbarControl<"document-v1">[];
 clipboardInterchange?:ClipboardInterchangeFactory<RichDocumentCoreEditor>;
}
export interface LocalDocumentEditor extends Omit<LocalEditor,"view"|"insertImageFiles"> {
 selectionPolicy():"document-v1";
 view():RichDocumentView;
 selectDocument(...args:Parameters<RichDomEditor<"document-v1">["selectDocument"]>):ReturnType<RichDomEditor<"document-v1">["selectDocument"]>;
 replaceDocumentPlainText(...args:Parameters<RichDomEditor<"document-v1">["replaceDocumentPlainText"]>):ReturnType<RichDomEditor<"document-v1">["replaceDocumentPlainText"]>;
 pasteDocumentClipboard(...args:Parameters<RichDomEditor<"document-v1">["pasteDocumentClipboard"]>):ReturnType<RichDomEditor<"document-v1">["pasteDocumentClipboard"]>;
 collapseDocumentSelection(...args:Parameters<RichDomEditor<"document-v1">["collapseDocumentSelection"]>):ReturnType<RichDomEditor<"document-v1">["collapseDocumentSelection"]>;
 /** Opt-in HTML source port; usable only when a clipboard interchange factory was supplied. */
 source():import("@breditor/experimental-rich-content").RichDocumentSourceHost;
}
class DocumentOwner implements LocalDocumentEditor {
 readonly surface:HTMLDivElement;readonly toolbar:HTMLDivElement;readonly status:HTMLParagraphElement;
 #dom:RichDomEditor<"document-v1">;#release:()=>void;#render:RenderOptions;#disposed=false;#source:import("@breditor/experimental-rich-content").RichDocumentSourceHost|undefined;
 constructor(dom:RichDomEditor<"document-v1">,release:()=>void,render:RenderOptions){this.#dom=dom;this.#release=release;this.#render=render;this.surface=dom.surface;this.toolbar=dom.toolbar;this.status=dom.status;}
 selectionPolicy():"document-v1"{return "document-v1";}
 supportsRetainedAssetReferences():boolean{return this.#dom.supportsRetainedAssetReferences();}
 retainedAssetReferences(revision?:string):import("@breditor/experimental-rich-content").RichRetainedAssetReferencesRead{return this.#dom.retainedAssetReferences(revision);}
 checkRetainedAssetReferences(read:import("@breditor/experimental-rich-content").RichRetainedAssetReferencesRead,revision?:string):void{this.#dom.checkRetainedAssetReferences(read,revision);}
 execute(...args:Parameters<LocalDocumentEditor["execute"]>):ReturnType<LocalDocumentEditor["execute"]>{return this.#dom.execute(...args);}
 supportsTriggerComposite():boolean{return this.#dom.supportsTriggerComposite();}
 supportsCommandGroup():boolean{return this.#dom.supportsCommandGroup();}
 view():RichDocumentView{return this.#dom.view();}checkpointJson():string{return this.#dom.checkpointJson();}
 focus():void{this.#dom.focus();}refreshAssets():void{this.#dom.view();refreshAssets(this.surface,this.#render);}
 setReadOnly(...args:Parameters<LocalDocumentEditor["setReadOnly"]>):boolean{return this.#dom.setReadOnly(...args);}
 setRestrictedEditing(...args:Parameters<LocalDocumentEditor["setRestrictedEditing"]>):boolean{return this.#dom.setRestrictedEditing(...args);}
 navigateRestrictedRegion(...args:Parameters<LocalDocumentEditor["navigateRestrictedRegion"]>):ReturnType<LocalDocumentEditor["navigateRestrictedRegion"]>{return this.#dom.navigateRestrictedRegion(...args);}
 closeTypingGroup(...args:Parameters<LocalDocumentEditor["closeTypingGroup"]>):boolean{return this.#dom.closeTypingGroup(...args);}
 search():RichSearchHost{this.#dom.view();return this.#dom;}
 writing():import("@breditor/experimental-rich-content").RichWritingToolsHost{this.#dom.view();return this.#dom;}
 fullscreen():import("@breditor/experimental-rich-content").RichFullscreenHost{this.#dom.view();return this.#dom;}
 contextUi():import("@breditor/experimental-rich-content").RichContextUiHost{this.#dom.view();return this.#dom;}
 source():import("@breditor/experimental-rich-content").RichDocumentSourceHost{this.#dom.view();return this.#source??=this.#dom.documentSource();}
 setPlaceholderLabel(label:string|null):void{this.#dom.setPlaceholderLabel(label);}
 uiLocale():import("@breditor/experimental-rich-content").RichUiLocale{this.#dom.view();return this.#dom.uiLocale();}
 selectDocument(...args:Parameters<LocalDocumentEditor["selectDocument"]>):ReturnType<LocalDocumentEditor["selectDocument"]>{return this.#dom.selectDocument(...args);}
 replaceDocumentPlainText(...args:Parameters<LocalDocumentEditor["replaceDocumentPlainText"]>):ReturnType<LocalDocumentEditor["replaceDocumentPlainText"]>{return this.#dom.replaceDocumentPlainText(...args);}
 pasteDocumentClipboard(...args:Parameters<LocalDocumentEditor["pasteDocumentClipboard"]>):ReturnType<LocalDocumentEditor["pasteDocumentClipboard"]>{return this.#dom.pasteDocumentClipboard(...args);}
 collapseDocumentSelection(...args:Parameters<LocalDocumentEditor["collapseDocumentSelection"]>):ReturnType<LocalDocumentEditor["collapseDocumentSelection"]>{return this.#dom.collapseDocumentSelection(...args);}
 dispose():void{if(this.#disposed)return;this.#disposed=true;try{this.#dom.dispose();}finally{this.#release();}}
}
/** One explicit document owner per host; rollback preserves the original nodes on failed/cancelled startup. */
export function openLocalDocumentEditor(options:LocalDocumentEditorOptions&{crashRecovery:CrashRecoveryOptions}):Promise<RecoverableLocalDocumentEditor>;
export function openLocalDocumentEditor(options:LocalDocumentEditorOptions):Promise<LocalDocumentEditor>;
export async function openLocalDocumentEditor(options:LocalDocumentEditorOptions):Promise<LocalDocumentEditor>{
 if(options.crashRecovery!==undefined)return openRecoverableDocumentEditor(options,checkCrashRecoveryOptions(options.crashRecovery));
 options={...options};
 validateMarkdownInputPolicy(options.inputRules);
 validatePlaceholderOption(options.placeholder);resolveRichUi(options.ui);
 if(options.selectionEditing!=="document-v1")throw new TypeError("Expected explicit selectionEditing document-v1");
 if(options.rangeEditing!==undefined&&options.rangeEditing!=="general-v1")throw new TypeError("Document editing requires general-v1 ranges");
 checkLocalRichLanguage(options.richLanguage);
 if(options.readOnly!==undefined&&typeof options.readOnly!=="boolean")throw new TypeError("readOnly must be Boolean");
 if(options.history!==undefined&&options.history!=="explicit"&&options.history!=="typing-v1")throw new TypeError("Expected history explicit or typing-v1");
 const initial=structuredClone(options.initial??{kind:"empty"}) as LocalDocumentInitial;
 if(!["empty","document","documentCheckpoint","documentTypingCheckpoint"].includes(initial.kind))throw new TypeError("Use an explicit document checkpoint discriminator");
 if(initial.kind==="documentTypingCheckpoint"&&options.history==="explicit")throw new TypeError("A document typing checkpoint requires natural history");
 const claim=claimHost(options.host,options.signal);let profile:RichCoreProfile|undefined,core:RichDocumentCoreEditor|undefined,dom:RichDomEditor<"document-v1">|undefined;
 try{
  const runtime=await awaitInitialization(initializeLocalRuntime(options.runtimeInput),options.signal);claim.assert();const language=options.richLanguage??1;
  profile=compileLocalLanguageProfile(runtime,language,options.profileBootstrapJson);
  if(options.placeholder!==undefined&&profile.supportsPlaceholder?.()!==true)throw Error("Use a matching native placeholder profile before creating an editor");
  if(profile.supportsDocumentSelection?.()!==true||!profile.createDocumentEditor||!profile.restoreDocumentEditor||!profile.restoreDocumentTypingEditor)throw Error("Use matching native document-family creation and recovery");
  const presentation=createStandardRichInlinePresentationV1(profile.inlineCatalogJson(),options.additionalInlinePresentation),block=initial.kind==="empty"?initial.blockId??crypto.randomUUID():undefined;
  core=initial.kind==="documentCheckpoint"?profile.restoreDocumentEditor(initial.checkpointJson):initial.kind==="documentTypingCheckpoint"?profile.restoreDocumentTypingEditor(initial.checkpointJson):profile.createDocumentEditor(initial.kind==="document"?initial.documentJson:emptyDocumentJson(profile.descriptor(),initial.documentId??crypto.randomUUID(),block!));
  if(block){const point={block,offset:"0",affinity:"after" as const};core.execute({kind:"setSelection",selection:{kind:"text",anchor:point,focus:point}});}
  const history=options.history??(initial.kind==="documentTypingCheckpoint"?"typing-v1":"explicit");
  if(history==="typing-v1"){if(core.supportsTypingHistory?.()!==true||!core.enableTypingHistory)throw Error("Use matching native document typing history");core.enableTypingHistory();}
  else if(core.view().historyGrouping!==undefined)throw Error("Explicit history cannot flatten a document typing checkpoint");
  if(options.readOnly!==undefined){if(core.supportsReadOnly?.()!==true||!core.setReadOnly)throw Error("Use matching native read-only enforcement");core.setReadOnly(options.readOnly);}
  const standard=localLanguageToolbar(core,presentation,language),toolbar=options.toolbar?.(core,standard,presentation)??standard;
  const render:RenderOptions={inlinePresentation:presentation,...(options.resolveAsset?{resolveAsset:options.resolveAsset}:{})};
  const {clipboardInterchange:factory,...domOptions}=options,interchange=clipboardInterchangeOptions(factory,core);
  claim.assert();dom=mountDocumentRichEditor(options.host,{...domOptions,...interchange,core,...render,toolbar});claim.assert();return new DocumentOwner(dom,claim.release,render);
 }catch(error){try{if(dom)dom.dispose();else core?.dispose();}finally{claim.rollback();}throw error;}
 finally{profile?.dispose();}
}
/** The checkpoint family this opening exports: natural typing history or explicit history. */
function documentTypingFamily(options:LocalDocumentEditorOptions):boolean{return options.history==="typing-v1"||(options.history===undefined&&options.initial?.kind==="documentTypingCheckpoint");}
/** Restore in a fresh headless document owner of the same profile and require a byte-exact re-export. */
async function verifyDocumentCheckpoint(options:LocalDocumentEditorOptions,typing:boolean,checkpointJson:string):Promise<boolean>{
 const profile=compileLocalLanguageProfile(await initializeLocalRuntime(options.runtimeInput),options.richLanguage??1,options.profileBootstrapJson);
 let core:RichDocumentCoreEditor|undefined;
 try{
  const restore=typing?profile.restoreDocumentTypingEditor:profile.restoreDocumentEditor;
  if(profile.supportsDocumentSelection?.()!==true||!restore)return false;
  core=restore.call(profile,checkpointJson);
  return core.checkpointJson()===checkpointJson;
 }finally{try{core?.dispose();}finally{profile.dispose();}}
}
async function openRecoverableDocumentEditor(options:LocalDocumentEditorOptions,recovery:ReturnType<typeof checkCrashRecoveryOptions>):Promise<RecoverableLocalDocumentEditor>{
 const {crashRecovery:_crashRecovery,signal,onChange,onError,...rest}=options,typing=documentTypingFamily(options);
 const policy:RecoveryPolicy={readOnly:options.readOnly,restricted:undefined};
 const supervisor=await CrashSupervisor.open<LocalDocumentEditor>({
  host:options.host,options:recovery,onChange:onChange as never,onError,
  verify:checkpointJson=>verifyDocumentCheckpoint(options,typing,checkpointJson),
  reapply:owner=>{if(policy.restricted)owner.setRestrictedEditing(policy.restricted.policy);},
  open:(callbacks,restart)=>{
   if(!restart)return openLocalDocumentEditor({...rest,...callbacks,...(signal?{signal}:{})});
   const {readOnly:_readOnly,...stable}=rest;
   return openLocalDocumentEditor({...stable,...callbacks,signal:restart.signal,
    initial:typing?{kind:"documentTypingCheckpoint",checkpointJson:restart.checkpointJson}:{kind:"documentCheckpoint",checkpointJson:restart.checkpointJson},
    ...(policy.readOnly!==undefined?{readOnly:policy.readOnly}:{})});
  },
 });
 return new RecoverableDocumentOwner(supervisor,policy);
}
