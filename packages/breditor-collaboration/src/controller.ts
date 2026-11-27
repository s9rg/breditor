import {isStructuralRichLanguage} from "@breditor/experimental-rich-content/rendering";
import {id,text,sourceCell,render,requireRenderOptions,paintSelection,refreshAssets,readNative,readTarget,restoreDocumentNative,nativeSelectsDocument,standardInlineStylesV1,structuralBlockStylesV2,richTableScrollStyles,releaseRichTableScroll,richPageBreakStyles,richLegalListStyles,type RichModel,type RenderOptions} from "@breditor/experimental-rich-content/rendering";
import {SharedRichEditor,SharedEditorError} from "./core.js";
import {bold,boundaryDelete,caret,cellBlock,enter,positionAfter,removeSelection,type ActionContext,type SharedToolbarControl} from "./actions.js";
import {defaultSharedToolbarFor,moveSharedToolbarFor,sharedListTab,sharedListTabApplies} from "./toolbar.js";
import type {SharedDispatch,SharedPublication,RichSelection,Navigation,SharedSelectionPolicy,SharedEditorView,SharedDocumentSelection} from "./types.js";
import {sharedPresentationModel} from "./document_presentation.js";
import {requireSharedDocumentBrowserCore} from "./document_core.js";
import {sharedDocumentSelectionStyles} from "./document_selection_styles.js";
import type {RichClipboardTextProjection} from "./types.js";
import {sharedTaskTab} from "./task_actions_v2.js";
import {flowEdgeEligible,selectedFlowAtom} from "@breditor/experimental-rich-content/rendering";
import {mountToolbarControl,toolbarControlStyles,isCurrentCaretTarget,type RichControlView} from "@breditor/experimental-rich-content/rendering";
import {resolveRichUi,type RichUiLocale,type RichUiOptions} from "@breditor/experimental-rich-content/rendering";
import {standardSelectionInlineControls,selectionFormatChanges} from "@breditor/experimental-rich-content/rendering";
import {richRubyStyles,richInlinePresentationHasRuby} from "@breditor/experimental-rich-content/rendering";
import {blockLayoutShortcut} from "@breditor/experimental-rich-content/rendering";
import {requireClipboardInterchange,readClipboardInput,readClipboardText,exportClipboard,writeClipboard,clipboardInterchangeReport,clipboardInterchangeStatus,clipboardProjectionText,type ClipboardInput,type RichTextPasteIntent,type RichClipboardInterchange,type RichClipboardInterchangeReport,type RichInterchangeFormatReport} from "@breditor/experimental-rich-content/rendering";
import {requireMarkdownPaste,MarkdownPasteSession,type RichMarkdownPasteEvent,type RichMarkdownPasteOption} from "@breditor/experimental-rich-content/rendering";
import {RichSearchEvents,type RichSearchHostState,type RichSearchCompletion} from "@breditor/experimental-rich-content/rendering";
import type {RichSearchQuery,RichSearchReplacement} from "@breditor/experimental-rich-content";
import type {SharedSearchResults} from "./search_results.js";
import {requireInputRules,inputRuleTypography,needsInputRuleSets,isPlainInputScalar,captureMarkdownInputSource,checkMarkdownInputSource,publishMarkdownInput,type MarkdownInputSource,type RichInputRulesOption} from "@breditor/experimental-rich-content/rendering";
import type {RichInputRuleId,RichInputRuleOutcome,RichTypographyOptions} from "@breditor/experimental-rich-content";
import type {RichWritingToolsRead} from "@breditor/experimental-rich-content";
import {RichWritingEvents,RichWritingReadRegistry,type RichWritingToolsHostState} from "@breditor/experimental-rich-content/rendering";
import {prepareRichPlaceholder,RichPlaceholderPresentation,richPlaceholderStyles} from "@breditor/experimental-rich-content/rendering";
import {richCoordinatorShortcuts,type RichShortcutEntry} from "@breditor/experimental-rich-content/rendering";
import {mountSharedV4BlockFieldDom,sharedV4RenderOptions} from "./v4_block_fields_dom.js";
export interface SharedDomOptions<P extends SharedSelectionPolicy="original"> extends RenderOptions {
 core:SharedRichEditor<P>;toolbar?:readonly SharedToolbarControl<P>[];label?:string;image?:{asset:string;alt:string};
 /** Opt-in chrome catalog and chrome `dir`/`lang`. Never changes the editing surface or content direction. */
 ui?:RichUiOptions;
 /** Initial native-prompt label; mode is admitted at startup, never a saved setting. */
 placeholder?:string;
 /** Immutable explicit view family; omission keeps the original contract. */
 selectionEditing?:P;
 /** Existing default transfers the owner. Borrow only when a persistent session owns its closure. */
 coreOwnership?:"transfer"|"borrow";
 /** Immutable explicit native shortcut policy (`markdown-v1`, `autolink-v1`, `typography-v1` or a configured typography entry, alone or listed); omitted preserves ordinary input. */
 inputRules?:RichInputRulesOption;
 /** Input committed but conversion refused; this is not a failed or repeatable keystroke. */
 onInputRuleRefused?:()=>void;
 onChange?:(event:SharedPublication<P>)=>void|Promise<void>;onError?:(error:unknown)=>void;
 /** Explicit caption/code text conversion, reported only after successful guarded publication. */
 onPasteLoss?:(report:RichClipboardTextProjection)=>void;
 /** Explicit parser-free port; omission preserves private/plain clipboard behavior. */
 clipboardInterchange?:RichClipboardInterchange;
 /** Delivered only after retained Copy or accepted native Cut/Paste. */
 onInterchange?:(report:RichClipboardInterchangeReport)=>void;
 /** Immutable. `detect` converts a text/plain-only paste that `markdown-paste-detect-v1` accepts; needs `clipboardInterchange`. */
 markdownPaste?:RichMarkdownPasteOption;
 /** Show the built-in "Undo to plain text" notice after an automatic conversion. */
 markdownPasteNotice?:boolean;
 /** Delivered once per accepted automatic conversion, after `onInterchange`. */
 onMarkdownPaste?:(event:RichMarkdownPasteEvent)=>void;
 onFiles?:(files:readonly File[],position:{parent:string|null;before:string|null},revision:string)=>void|Promise<void>;
 /** Document-aware asset replacement retains this guard and submits one native rich paste. */
 onDocumentFiles?:(files:readonly File[],revision:string)=>void|Promise<void>;
}
export type SharedDocumentDomOptions=Omit<SharedDomOptions<"document-v1">,"selectionEditing">&{selectionEditing:"document-v1"};
interface Work<P extends SharedSelectionPolicy> {run:(context:ActionContext<P>)=>void;revision:string;focus:boolean;boundary:boolean;accepted?:((display:boolean)=>void)|undefined;completion?:RichSearchCompletion|undefined}
type Composition={block:string;original:string;revision:string;release:()=>void;target?:Extract<RichSelection,{kind:"text"}>}|{document:true;revision:string;release:()=>void};
function sameSelection(a:SharedDocumentSelection|null,b:SharedDocumentSelection|null):boolean{
 if(a?.kind!==b?.kind)return false;if(!a||!b)return a===b;
 if(a.kind==="node"&&b.kind==="node")return a.block===b.block;
 if(a.kind==="document"&&b.kind==="document")return true;
 if(a.kind==="text"&&b.kind==="text")return a.anchor.block===b.anchor.block&&a.anchor.offset===b.anchor.offset&&a.anchor.affinity===b.anchor.affinity&&a.focus.block===b.focus.block&&a.focus.offset===b.focus.offset&&a.focus.affinity===b.focus.affinity;
 if(a.kind==="grid"&&b.kind==="grid")return a.anchor.table===b.anchor.table&&a.anchor.row===b.anchor.row&&a.anchor.column===b.anchor.column&&a.focus.table===b.focus.table&&a.focus.row===b.focus.row&&a.focus.column===b.focus.column;return false;
}
/** DOM coordinator only. Native Rust observations authorize every mutation and history operation. */
export class SharedDomEditor<P extends SharedSelectionPolicy="original"> {
 readonly surface:HTMLDivElement;readonly toolbar:HTMLDivElement;readonly status:HTMLParagraphElement;
 #root:HTMLElement;#options:SharedDomOptions<P>;#model:RichModel<P>;#abort=new AbortController();#unsubscribe:()=>void;
 #disposed=false;#busy=false;#refreshing=false;#logical=false;#queue:Work<P>[]=[];#composition:Composition|undefined;#reportedError:{error:unknown}|undefined;#ui:RichUiLocale;
 readonly #searchEvents=new RichSearchEvents();
 readonly #writingEvents=new RichWritingEvents();readonly #writingReads=new RichWritingReadRegistry();
 readonly #placeholder:RichPlaceholderPresentation|undefined;
 #prefix=`shared:${crypto.randomUUID()}`;#counter=0n;#controls:{control:SharedToolbarControl<P>;view:RichControlView<ActionContext<P>>}[]=[];
 readonly #borrowed=new Set<{control:SharedToolbarControl<P>;view:RichControlView<ActionContext<P>>}>();
 readonly #selectionPolicy:P;readonly #document:SharedRichEditor<"document-v1">|undefined;
 readonly #interchange:RichClipboardInterchange|undefined;readonly #markdownPaste:MarkdownPasteSession;
 readonly #inputRules:boolean;readonly #inputRuleIds:readonly RichInputRuleId[]|null;readonly #typography:RichTypographyOptions|null;
 constructor(root:HTMLElement,options:SharedDomOptions<P>&(P extends "document-v1"?SharedDocumentDomOptions:unknown)){
  const policy=options.selectionEditing??"original";
  if(policy!=="original"&&policy!=="document-v1")throw new TypeError("Expected selectionEditing original or document-v1");
  if((options.core.selectionPolicy?.()??"original")!==policy)throw Error("The original shared DOM owner does not admit document-selection facades without an explicit matching policy");
  this.#selectionPolicy=policy as P;this.#document=policy==="document-v1"?requireSharedDocumentBrowserCore(options.core):undefined;
  this.#interchange=requireClipboardInterchange(options.clipboardInterchange,options.core);
  const markdownPaste=requireMarkdownPaste(options.markdownPaste,this.#interchange,options.markdownPasteNotice);
  this.#inputRuleIds=requireInputRules(options.inputRules,options.core);this.#typography=inputRuleTypography(options.inputRules);this.#inputRules=this.#inputRuleIds!==null;
  const placeholder=prepareRichPlaceholder(options.placeholder,options.core);
  this.#root=root;this.#options=options;this.#model=this.#read();this.#logical=this.#isLogical();
  requireRenderOptions(this.#model,options);
  if(this.#model.view.historyGrouping==="typing-v1"&&!options.core.supportsTypingHistory())throw Error("Use matching native shared typing history");
  for(const control of options.toolbar??[...defaultSharedToolbarFor<P>(),...moveSharedToolbarFor<P>()])if(control.owner!==undefined&&control.owner!==options.core)throw Error("Toolbar control belongs to a different Rust owner");
  const ui=resolveRichUi(options.ui);ui.checkControls(options.toolbar??[...defaultSharedToolbarFor<P>(),...moveSharedToolbarFor<P>()]);this.#ui=ui;
  const d=root.ownerDocument,style=d.createElement("style");style.textContent=styles+standardInlineStylesV1+toolbarControlStyles+(structuralBlockStylesV2+richPageBreakStyles+richLegalListStyles).replaceAll("[data-breditor-rich]","[data-breditor-shared]")+(options.scrollableTables?richTableScrollStyles:"")+(this.#document?sharedDocumentSelectionStyles:"")+(placeholder?richPlaceholderStyles:"")+(options.inlinePresentation&&richInlinePresentationHasRuby(options.inlinePresentation)?richRubyStyles:"");root.dataset["breditorShared"]="";
  this.surface=d.createElement("div");this.surface.contentEditable="true";this.surface.className="breditor-shared-surface";this.surface.setAttribute("role","textbox");this.surface.setAttribute("aria-multiline","true");this.surface.setAttribute("aria-label",options.label??ui.text("sharedEditorLabel"));
  this.toolbar=d.createElement("div");this.toolbar.className="breditor-shared-toolbar";this.toolbar.setAttribute("role","toolbar");this.toolbar.setAttribute("aria-label",ui.text("sharedToolbarLabel"));ui.applyChrome(this.toolbar);this.status=d.createElement("p");this.status.setAttribute("role","status");ui.applyChrome(this.status);
  this.#markdownPaste=new MarkdownPasteSession(markdownPaste,{ui,anchor:this.status,notice:options.markdownPasteNotice===true,onEvent:event=>this.#options.onMarkdownPaste?.(event),report:error=>this.#report(error),signal:this.#abort.signal});
  const seen=new Set<string>();for(const control of options.toolbar??[...defaultSharedToolbarFor<P>(),...moveSharedToolbarFor<P>()]){
   if(seen.has(control.id))throw Error("Duplicate shared toolbar control");seen.add(control.id);
   const view=this.#mountControl(this.toolbar,control,this.#abort.signal);this.#controls.push({control,view});
  }
  this.#placeholder=placeholder?new RichPlaceholderPresentation(this.surface,placeholder.label):undefined;
  root.replaceChildren(style,this.toolbar,this.#placeholder?.container??this.surface,this.status);render(this.surface,this.#model,sharedV4RenderOptions(options.core,options));this.#refreshControls();
  if(this.#placeholder){this.#placeholder.update(placeholder!.empty&&this.#model.view.readOnly!==true);this.#writingEvents.subscribe(()=>this.#refreshPlaceholder());}
  if(this.#model.view.readOnly===true)this.status.textContent=ui.text("sharedStatusReadOnly",{revision:this.#model.view.revision});
  this.#unsubscribe=options.core.subscribe(event=>{const policy=event.view.readOnlyRevision!==this.#model.view.readOnlyRevision||event.view.readOnly!==this.#model.view.readOnly;if(policy){const composition=this.#composition;this.#composition=undefined;this.#cancelQueue(Error("Editing policy cancelled queued search work"));composition?.release();this.#refresh(false);}else if(!this.#busy&&!this.#composition)this.#refresh(false);try{void Promise.resolve(options.onChange?.(event)).catch(error=>this.#report(error));}catch(error){this.#report(error);}});
  const signal=this.#abort.signal;
  this.surface.addEventListener("beforeinput",event=>this.#input(event as InputEvent),{signal});
  this.surface.addEventListener("input",()=>{if(!this.#composition)this.#refresh(false,true);},{signal});
  this.surface.addEventListener("keydown",event=>this.#key(event),{signal});
  if(this.#markdownPaste.enabled)this.surface.addEventListener("keyup",event=>{const revision=this.#model.view.revision;this.#markdownPaste.keyup(event,text=>{if(!this.#disposed&&this.#options.core.view().revision===revision)this.pasteText(text,"literal");});},{signal});
  this.surface.addEventListener("pointerdown",event=>this.#pick(event),{signal});
  this.surface.addEventListener("blur",()=>this.#boundary(),{capture:true,signal});
  this.toolbar.addEventListener("pointerdown",()=>this.#boundary(),{capture:true,signal});
  this.toolbar.addEventListener("focusin",()=>this.#boundary(),{capture:true,signal});
  this.surface.addEventListener("click",event=>this.#taskCheck(event),{signal});
  mountSharedV4BlockFieldDom(this.surface,options.core,()=>this.#model,signal);
  this.surface.addEventListener("copy",event=>this.#copy(event,false),{signal});this.surface.addEventListener("cut",event=>this.#copy(event,true),{signal});this.surface.addEventListener("paste",event=>this.#paste(event),{signal});
  this.surface.addEventListener("dragover",event=>{if(event.dataTransfer?.types.includes("Files"))event.preventDefault();},{signal});this.surface.addEventListener("drop",event=>{if(event.dataTransfer?.files.length){event.preventDefault();this.#files([...event.dataTransfer.files]);}},{signal});
  this.surface.addEventListener("compositionstart",()=>this.#startComposition(),{signal});this.surface.addEventListener("compositionend",event=>this.#endComposition(event.data),{signal});
  d.addEventListener("selectionchange",()=>{if(!this.#busy&&!this.#composition)this.#attempt(()=>this.#sync());},{signal});
  this.#placeholder?.activate();
 }
 #read():RichModel<P>{return sharedPresentationModel<P>(this.#options.core.view(),this.#selectionPolicy);}
 #isLogical():boolean{return ["grid","node","document"].includes(this.#model.view.selection?.kind??"");}
 #live():void{if(this.#disposed)throw new SharedEditorError("disposed","The shared DOM editor is disposed");}
 #allocate=(kind:string):string=>`${this.#prefix}:${kind}:${this.#counter++}`;
 #context():ActionContext<P>{const value:ActionContext<P>={core:this.#options.core,model:this.#model,revision:this.#model.view.revision,allocate:this.#allocate};if(this.#options.image)value.image=this.#options.image;return value;}
 #report(error:unknown):void{if(this.#disposed)return;this.#reportedError={error};this.status.textContent=this.#ui.describe(error,String(error));try{this.#options.onError?.(error);}catch{/* A callback cannot rewind committed state. */}}
 #alreadyReported(error:unknown):boolean{return this.#reportedError!==undefined&&this.#reportedError.error===error;}
 #attempt(run:()=>void):void{this.#reportedError=undefined;try{run();}catch(error){if(!this.#alreadyReported(error)){this.#refresh(false);this.#report(error);}}}
 #mountControl(container:HTMLElement,control:SharedToolbarControl<P>,signal:AbortSignal):RichControlView<ActionContext<P>>{return mountToolbarControl(container,control,{prefix:"shared",ui:this.#ui,surface:this.surface,signal,sync:()=>this.#sync(),stamp:()=>JSON.stringify(this.#options.core.view()),attempt:work=>this.#attempt(work),focus:()=>this.focus(),run:(value,fields)=>this.#perform(c=>control.run(c,value,fields))});}
 /** Context UI port (see RichContextUiHost): the same admitted control, widget, gating and command path in another presentation. */
 contextUiState():{readonly revision:string;readonly closed:boolean;readonly busy:boolean;readonly composing:boolean;readonly readOnly:boolean;readonly selection:"none"|"caret"|"text"|"node"|"grid"|"document";readonly emptyParagraph:boolean}{
  const view=this.#model.view,s=view.selection,selection=!s?"none" as const:s.kind==="text"?(s.anchor.block===s.focus.block&&s.anchor.offset===s.focus.offset?"caret" as const:"text" as const):s.kind;
  const node=selection==="caret"&&s?.kind==="text"?this.#model.nodes.get(s.focus.block):undefined,emptyParagraph=node?.type==="breditor/paragraph"&&node.children.every(child=>child.kind==="text"&&!child.text);
  return Object.freeze({revision:view.revision,closed:this.#disposed,busy:this.#busy,composing:!!this.#composition,readOnly:view.readOnly===true,selection,emptyParagraph});
 }
 /** Editor shell port: the chords this coordinator's keydown routing owns, from the same controls and capabilities. */
 contextShortcuts():readonly RichShortcutEntry[]{
  const core=this.#options.core,structural=isStructuralRichLanguage(core.richLanguageVersion());
  return richCoordinatorShortcuts({ui:this.#ui,controls:this.#controls.map(entry=>entry.control),structural,selectionFormatting:core.supportsSelectionFormatting()&&!!this.#options.inlinePresentation,flowNavigation:core.supportsFlowNavigation(),blockLayout:core.supportsBlockLayout(),pastePlain:this.#markdownPaste.enabled});
 }
 subscribeContextUi(listener:()=>void):()=>void{this.#live();return this.#writingEvents.subscribe(listener);}
 /** The validated chrome catalog; opt-in tools read their strings and chrome direction from it. */
 uiLocale():RichUiLocale{return this.#ui;}
 contextControlIds():readonly string[]{return Object.freeze(this.#controls.map(entry=>entry.control.id));}
 mountContextControl(container:HTMLElement,id:string,signal:AbortSignal):{readonly id:string;readonly element:HTMLElement;readonly button:HTMLButtonElement;activate():void}{
  this.#live();const found=this.#controls.find(item=>item.control.id===id);if(!found)throw Error(`Toolbar control ${id} is not admitted by this editor`);
  if(signal.aborted||this.#abort.signal.aborted)throw Error("Context control lease is already closed");
  if(container.ownerDocument!==this.surface.ownerDocument||container===this.surface||this.surface.contains(container)||container.contains(this.surface))throw Error("Context controls need a host outside editable content in the editor document");
  const abort=new AbortController(),stop=()=>abort.abort();this.#abort.signal.addEventListener("abort",stop,{signal:abort.signal});signal.addEventListener("abort",stop,{signal:abort.signal});
  const view=this.#mountControl(container,found.control,abort.signal),element=view.button.parentElement as HTMLElement,entry={control:found.control,view},boundary=()=>this.#boundary();
  element.addEventListener("pointerdown",boundary,{capture:true,signal:abort.signal});element.addEventListener("focusin",boundary,{capture:true,signal:abort.signal});
  this.#borrowed.add(entry);abort.signal.addEventListener("abort",()=>{this.#borrowed.delete(entry);element.remove();},{once:true});this.#refreshControls(entry);
  return Object.freeze({id,element,button:view.button,activate:()=>{if(!abort.signal.aborted)view.activate();}});
 }
 #refreshControls(only?:{control:SharedToolbarControl<P>;view:RichControlView<ActionContext<P>>}):void{const context=this.#context(),stamp=JSON.stringify(this.#options.core.view());for(const {control,view}of only?[only]:[...this.#controls,...this.#borrowed])view.refresh(context,control.enabled(context)&&(this.#model.view.readOnly!==true||control.readOnlySafe===true),stamp);}
 #refresh(focus:boolean,force=false):void{
  if(this.#disposed||this.#composition)return;this.#refreshing=true;try{const previous=this.#model.view.documentJson,policy=this.#model.view.readOnlyRevision,active=this.surface.ownerDocument.activeElement,ownedFocus=active===this.surface||!!active&&this.surface.contains(active);
  this.#model=this.#read();this.#logical=this.#isLogical();this.#markdownPaste.sync(this.#model.view.revision);
  if(force||previous!==this.#model.view.documentJson||policy!==this.#model.view.readOnlyRevision)render(this.surface,this.#model,sharedV4RenderOptions(this.#options.core,this.#options));else paintSelection(this.surface,this.#model);
  if(focus||ownedFocus){this.surface.focus({preventScroll:true});restoreDocumentNative(this.surface,this.#model.view.selection);}this.#refreshControls();
  this.status.textContent=this.#ui.text(this.#model.view.readOnly===true?"sharedStatusReadOnlyLive":"sharedStatus",{revision:this.#model.view.revision,undo:this.#model.view.undoDepth,pending:this.#options.core.pendingRemote().frames});
  }finally{this.#refreshing=false;this.#notifySearch();}
 }
 #sync():void{if(this.#busy||this.#composition||this.#logical)return;const active=this.surface.ownerDocument.activeElement;if(active!==this.surface&&(!active||!this.surface.contains(active)))return;if(this.#document&&nativeSelectsDocument(this.surface)){this.#perform(c=>{this.#document!.selectDocument(c.revision);},false);return;}const selection=readNative(this.surface,this.#model);if(selection&&!sameSelection(selection,this.#model.view.selection))this.#perform(c=>{c.core.select(selection,c.revision);},false);}
 #captureMarkdownInput(event:InputEvent):MarkdownInputSource|null {
  if(!this.#inputRules||event.inputType!=="insertText"||!isPlainInputScalar(event.data??"")||this.#logical)return null;
  const ranges=event.getTargetRanges?.()??[];if(ranges.length>1)return null;
  const target=ranges[0]?readTarget(this.surface,ranges[0]):null;if(ranges.length&&!target)return null;
  const active=this.surface.ownerDocument.activeElement,owned=active===this.surface||!!active&&this.surface.contains(active);
  if(this.#document&&owned&&nativeSelectsDocument(this.surface))return null;
  const native=readNative(this.surface,this.#model),selection=native??this.#model.view.selection;
  if(selection?.kind!=="text"||target&&!isCurrentCaretTarget(selection,target))return null;
  const willSync=!this.#busy&&owned&&native!==null&&!sameSelection(native,this.#model.view.selection);
  return captureMarkdownInputSource(this.#model.view.revision,selection,willSync);
 }
 #typeMarkdown(source:MarkdownInputSource,text:string):void {
  const view=this.#options.core.view();checkMarkdownInputSource(view,source);
  const inputRule=Object.freeze({text,namespace:this.#allocate("rule"),...(view.historyGrouping==="typing-v1"?{clockMs:this.#clock()}:{} ),...(needsInputRuleSets(this.#inputRuleIds)?{rules:this.#inputRuleIds!,...(this.#typography?{typography:this.#typography}:{})}:{})});
  let outcome:RichInputRuleOutcome|undefined;
  this.#perform(c=>{outcome=publishMarkdownInput(c.core,inputRule,c.revision);},true,source.revision,false,()=>{if(outcome==="refused")this.#inputRuleRefused();});
 }
 /** `markdown-v1` code Enter: only a collapsed code caret takes the exclusive call; Rust decides the exit. */
 #codeEnter(c:ActionContext<P>):boolean{const s=c.model.view.selection;return !!this.#inputRuleIds?.includes("markdown-v1")&&!this.#logical&&s?.kind==="text"&&s.anchor.block===s.focus.block&&s.anchor.offset===s.focus.offset&&c.model.nodes.get(s.focus.block)?.type==="breditor/code-block";}
 #inputRuleRefused():void{if(this.#disposed)return;this.status.textContent=this.#ui.text("inputRuleRefused");try{this.#options.onInputRuleRefused?.();}catch(error){this.#report(error);}}
 #perform(run:(context:ActionContext<P>)=>void,focus=true,revision=this.#model.view.revision,boundary=false,accepted?:((display:boolean)=>void),completion?:RichSearchCompletion):void{
  this.#live();if((this.#searchEvents.notifying||this.#writingEvents.notifying))throw Error("Read notifications cannot publish reentrantly");if(this.#queue.length>=128)throw Error("Shared editor command queue is full");this.#queue.push({run,focus,revision,boundary,accepted,completion});if(this.#busy||this.#composition)return;
  const release=this.#options.core.holdRemotes();this.#busy=true;let error:unknown,drained=0;
  try{while(!this.#disposed&&this.#queue.length){if(++drained>128){const failure=Error("Shared editor callback command loop exceeded its bound");this.#cancelQueue(failure);throw failure;}const next=this.#queue.shift()!;
   let published=false,display=true;
   try{if(next.revision!==this.#options.core.view().revision)throw new SharedEditorError("stale_observation","Queued work was prepared from an older publication");next.run(this.#context());published=true;if(next.boundary){this.#model=this.#read();this.#refreshControls();}else this.#refresh(next.focus);}catch(e){display=false;if(!published)next.completion?.reject(e);error??=e;this.#refresh(false);this.#report(e);}
   finally{if(published){next.completion?.resolve();next.accepted?.(display);}}
  }}finally{this.#busy=false;release();this.#notifySearch();}if(error!==undefined)throw error;
 }
 #notifySearch():void{this.#searchEvents.emit(error=>this.#report(error));this.#writingEvents.emit(error=>this.#report(error));}
 #refreshPlaceholder():void{if(!this.#placeholder)return;this.#placeholder.update(false);if(this.#disposed||this.#busy||this.#composition||this.#model.view.readOnly===true)return;try{this.#placeholder.update(this.#options.core.placeholderEmpty(this.#model.view.revision));}catch(error){this.#report(error);}}
 /** Pure presentation change, including readonly/composition; never a writer command. */
 setPlaceholderLabel(label:string|null):void{this.#live();if(!this.#placeholder)throw Error("Admit a native placeholder at startup before changing its label");this.#placeholder.setLabel(label);}
 supportsRetainedAssetReferences():boolean{this.#live();return this.#options.core.supportsRetainedAssetReferences();}
 retainedAssetReferences(revision=this.#model.view.revision):import("@breditor/experimental-rich-content").RichRetainedAssetReferencesRead{this.#live();if(this.#busy||this.#composition)throw Error("Asset reference reads wait for the current operation or composition");return this.#options.core.retainedAssetReferences(revision);}
 checkRetainedAssetReferences(read:import("@breditor/experimental-rich-content").RichRetainedAssetReferencesRead,revision=this.#model.view.revision):void{this.#live();if(this.#busy||this.#composition)throw Error("Asset reference checks wait for the current operation or composition");this.#options.core.checkRetainedAssetReferences(read,revision);}
 writingState():RichWritingToolsHostState{const view=this.#model.view,closed=this.#disposed,core=this.#options.core;return Object.freeze({revision:view.revision,closed,busy:this.#busy,composing:!!this.#composition,available:!closed&&core.supportsWritingTools()&&typeof core.writingTools==="function",readOnly:view.readOnly===true});}
 subscribeWriting(listener:()=>void):()=>void{this.#live();return this.#writingEvents.subscribe(listener);}
 get fullscreenRoot():HTMLElement{return this.#root;}
 fullscreenState():import("@breditor/experimental-rich-content/rendering").RichFullscreenHostState{return Object.freeze({revision:this.#model.view.revision,closed:this.#disposed,busy:this.#busy,composing:!!this.#composition});}
 subscribeFullscreen(listener:()=>void):()=>void{this.#live();return this.#writingEvents.subscribe(listener);}
 focusFullscreen(revision:string):void{this.#live();const state=this.fullscreenState();if(state.busy||state.composing||state.revision!==revision||this.#searchEvents.notifying||this.#writingEvents.notifying)throw Error("Fullscreen focus requires the exact idle publication outside composition or notifications");this.surface.focus({preventScroll:true});restoreDocumentNative(this.surface,this.#model.view.selection);}
 readWritingTools(revision=this.#model.view.revision):RichWritingToolsRead{this.#live();const state=this.writingState();if(state.busy||state.composing)throw Error("Writing reads wait for the current operation or composition");if(!state.available)throw Error("Use complete matching native writing reads");return this.#writingReads.retain(this.#options.core.writingTools(revision),revision);}
 selectWritingHeading(read:RichWritingToolsRead,index:number,revision=read.revision):Promise<void>{return new Promise((resolve,reject)=>{try{this.#live();const state=this.writingState();if(state.busy||state.composing||this.#searchEvents.notifying||this.#writingEvents.notifying)throw Error("Writing navigation waits for the current operation, composition or read notification");const entry=this.#writingReads.heading(read,index,revision),point={block:entry.block,offset:"0",affinity:"after" as const};this.#perform(c=>{c.core.select({kind:"text",anchor:point,focus:point},c.revision);},true,revision,false,undefined,{resolve,reject});}catch(error){reject(error);}});}
 #cancelQueue(error:unknown):void{const pending=this.#queue;this.#queue=[];for(const work of pending)work.completion?.reject(error);}
 #searchAction(run:(context:ActionContext<P>)=>void,revision:string):Promise<void>{return new Promise((resolve,reject)=>{try{this.#perform(run,false,revision,false,undefined,{resolve,reject});}catch(error){reject(error);}});}
 searchState():RichSearchHostState{const view=this.#model.view,closed=this.#disposed,available=!closed&&this.#options.core.supportsSearch();return Object.freeze({revision:view.revision,closed,busy:this.#busy,composing:!!this.#composition,available,readOnly:view.readOnly===true,canReplace:available&&view.readOnly!==true&&this.#options.core.searchHistoryPolicy()==="search-v1"});}
 subscribeSearch(listener:()=>void):()=>void{this.#live();return this.#searchEvents.subscribe(listener);}
 findText(query:RichSearchQuery,revision=this.#model.view.revision):SharedSearchResults{this.#live();return this.#options.core.findText(query,revision);}
 checkSearchResults(results:SharedSearchResults,revision=this.#model.view.revision):void{this.#live();this.#options.core.checkSearchResults(results,revision);}
 selectSearchMatch(results:SharedSearchResults,index:string,revision=this.#model.view.revision):Promise<void>{return this.#searchAction(c=>{c.core.selectSearchMatch(results,index,c.revision);},revision);}
 replaceSearchOne(results:SharedSearchResults,index:string,replacement:RichSearchReplacement,revision=this.#model.view.revision):Promise<void>{const frozen=JSON.parse(JSON.stringify(replacement)) as RichSearchReplacement;return this.#searchAction(c=>{c.core.replaceSearchOne(results,index,frozen,c.revision);},revision);}
 replaceSearchAll(results:SharedSearchResults,replacement:RichSearchReplacement,revision=this.#model.view.revision):Promise<void>{const frozen=JSON.parse(JSON.stringify(replacement)) as RichSearchReplacement;return this.#searchAction(c=>{c.core.replaceSearchAll(results,frozen,c.revision);},revision);}
 execute(request:SharedDispatch,focus=true,revision=this.#model.view.revision):void{const frozen=JSON.parse(JSON.stringify(request)) as SharedDispatch;this.#perform(c=>{c.core.dispatch(frozen,c.revision);},focus,revision);}
 /**
  * One guarded native plain-text replacement of an explicit text range (the AI/language tools' Accept path): native
  * `replace_plain_text` (logical-start style, one explicit history group, never joined with typing) or, for a
  * general-v1 owner, native general range plain input. Remote frames are held while it runs.
  */
 replacePlainTextRange(selection:Extract<RichSelection,{kind:"text"}>,text:string,focus=true,revision=this.#model.view.revision):void{
  if(selection?.kind!=="text"||typeof text!=="string")throw new TypeError("Expected a text range and plain text");
  const frozen=structuredClone(selection);this.#perform(c=>{if(c.model.view.rangeEditing==="general-v1")c.core.replaceGeneralRangePlainText(frozen,text,c.allocate("range"),c.revision);else c.core.replace(frozen,text,c.revision);},focus,revision);
 }
 /** Asynchronous hosts can retain the publication that supplied their selection intent. */
 select(selection:RichSelection|null,focus=true,revision=this.#model.view.revision):void{const frozen=structuredClone(selection);this.#perform(c=>{c.core.select(frozen,c.revision);},focus,revision);}
 #documentOwner():SharedRichEditor<"document-v1">{this.#live();if(!this.#document)throw new SharedEditorError("selection_policy","Use an explicitly selected shared document DOM owner");return this.#document;}
 selectDocument(this:SharedDomEditor<"document-v1">,revision=this.#options.core.view().revision):void{const core=this.#documentOwner();this.#perform(c=>{core.selectDocument(c.revision);},true,revision);}
 collapseDocumentSelection(this:SharedDomEditor<"document-v1">,side:"before"|"after",revision=this.#options.core.view().revision):void{const core=this.#documentOwner();this.#perform(c=>{core.collapseDocumentSelection(side,c.revision);},true,revision);}
 replaceDocumentPlainText(this:SharedDomEditor<"document-v1">,text:string,revision=this.#options.core.view().revision):void{const core=this.#documentOwner(),paragraph=this.#allocate("p");this.#perform(c=>{core.replaceDocumentPlainText(paragraph,text,c.revision);},true,revision);}
 /** Apply host-supplied text with a literal default, through the native paste transaction. */
 pasteText(source:string,intent:RichTextPasteIntent="literal"):void {
  this.#live();if(this.#model.view.readOnly===true||this.#composition||this.#busy)return;
  this.#boundary();this.#attempt(()=>this.#pasteInput(grid=>readClipboardText(source,this.#interchange,grid,intent)));
 }
 pasteDocumentClipboard(this:SharedDomEditor<"document-v1">,clipboardJson:string,revision=this.#options.core.view().revision):void{const core=this.#documentOwner(),prefix=this.#allocate("paste");this.#perform(c=>{core.pasteDocumentClipboard(clipboardJson,prefix,c.revision);},true,revision);}
 view():SharedEditorView<P>{this.#live();return this.#options.core.view();}
 checkpointJson():string{this.#live();return this.#options.core.checkpointJson();}
 focus():void{this.#live();this.surface.focus();restoreDocumentNative(this.surface,this.#model.view.selection);}
 /** Read-only retry after independently transferred image bytes become available. */
 refreshAssets():void{this.#live();refreshAssets(this.surface,this.#options);}
 setReadOnly(value:boolean,revision=this.#options.core.view().revision):boolean{this.#live();if(this.#busy||(this.#searchEvents.notifying||this.#writingEvents.notifying))throw Error("Editing policy cannot publish reentrantly");return this.#options.core.setReadOnly(value,revision);}
 /** Native intent fence: update cached publication/controls, never replace children or move focus. */
 closeTypingGroup(revision=this.#options.core.view().revision):boolean{this.#live();if(this.#busy||this.#composition||(this.#searchEvents.notifying||this.#writingEvents.notifying))throw Error("History boundaries cannot publish during a command, composition or read notification");if(this.#model.view.historyGrouping!=="typing-v1")return false;let changed=false;this.#perform(c=>{changed=c.core.closeTypingGroup(c.revision);},false,revision,true);return changed;}
 #boundary():void{if(this.#model.view.historyGrouping==="typing-v1"&&!this.#busy&&!this.#refreshing&&!this.#composition)this.#attempt(()=>{this.closeTypingGroup();});}
 #clock():string{const value=Math.floor(this.surface.ownerDocument.defaultView!.performance.now());if(!Number.isSafeInteger(value)||value<0)throw Error("Expected a finite monotonic typing clock");return String(value);}
 #deleteInput(c:ActionContext<P>,selection:Extract<RichSelection,{kind:"text"}>,backward:boolean,inputType:string):void{
  const current=c.model.view.selection;
  if(c.model.view.historyGrouping==="typing-v1"&&/^delete(?:Content|Word|SoftLine|HardLine)(?:Backward|Forward)$/.test(inputType)&&current?.kind==="text"&&current.anchor.block===current.focus.block&&current.anchor.offset===current.focus.offset&&selection.anchor.block===current.focus.block&&selection.focus.block===current.focus.block){
   const a=BigInt(selection.anchor.offset),b=BigInt(selection.focus.offset),start=a<b?a:b,end=a>b?a:b,at=BigInt(current.focus.offset);
   if(start<end&&(backward?end===at:start===at)){c.core.deleteUserRange(selection,backward?"backward":"forward",this.#clock(),c.revision);return;}
  }
  if(c.model.view.rangeEditing==="general-v1")c.core.replaceGeneralRangePlainText(selection,"",c.allocate("range"),c.revision);else c.core.replace(selection,"",c.revision);
 }
 #pick(event:PointerEvent):void{const target=event.target as Element,cell=target.closest<HTMLElement>("[data-select-cell]"),node=target.closest<HTMLElement>("[data-select-node]"),figure=target.closest<HTMLElement>("[data-rich-image]");
  this.#boundary();
  if(target.closest("input[data-task-check]"))return;
  if(cell){event.preventDefault();const focus=JSON.parse(cell.dataset["selectCell"]!) as Extract<RichSelection,{kind:"grid"}>["focus"],prior=this.#model.view.selection,anchor=event.shiftKey&&prior?.kind==="grid"&&prior.anchor.table===focus.table?prior.anchor:focus;this.#attempt(()=>this.select({kind:"grid",anchor,focus}));}
  else if(node||(figure&&!target.closest("[data-rich-text]"))){event.preventDefault();const block=node?.dataset["selectNode"]??figure?.dataset["richBlock"];if(block)this.#attempt(()=>this.select({kind:"node",block}));}else this.#logical=false;
 }
 #taskCheck(event:MouseEvent):void{
  const check=(event.target as Element).closest<HTMLInputElement>("input[data-task-check]");if(!check||!this.surface.contains(check))return;
  event.preventDefault();if(this.#composition||this.#model.view.readOnly===true||!isStructuralRichLanguage(this.#options.core.richLanguageVersion()))return;
  const item=check.dataset["taskCheck"],node=item?this.#model.nodes.get(item):undefined;if(!node||node.type!=="breditor/task-item")return;
  this.#attempt(()=>{this.#perform(c=>{c.core.dispatch({commands:[{kind:"set_task_checked",data:{block:id(node),checked:node.properties["breditor/checked"]!==true}}]},c.revision);});[...this.surface.querySelectorAll<HTMLInputElement>("input[data-task-check]")].find(input=>input.dataset["taskCheck"]===item)?.focus({preventScroll:true});});
 }
 /** A custom V2 toolbar must not remove Rust-owned selection-format keyboard semantics. */
 #selectionFormat(action:string|undefined):boolean {
  const {core,inlinePresentation}=this.#options;
  if(!action||!isStructuralRichLanguage(core.richLanguageVersion())||!core.supportsSelectionFormatting()||!inlinePresentation)return false;
  const control=standardSelectionInlineControls(core,inlinePresentation).find(c=>c.id===action);
  if(!control||control.fields)return false;
  if(control.read().kind!=="unavailable"){const changes=selectionFormatChanges(control.changes({}));if(changes.length)this.#perform(c=>{c.core.changeSelectionFormats(changes,c.revision);});}
  return true;
 }
 #key(event:KeyboardEvent):void{if(!this.#controls.some(item=>item.control.shortcut==="shift+v"))this.#markdownPaste.keydown(event);if(this.#composition||event.isComposing)return;const mod=event.metaKey||event.ctrlKey,key=event.key.toLowerCase();
  if(mod&&!["Backspace","Delete"].includes(event.key)||["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown","Tab","Enter","Escape"].includes(event.key))this.#boundary();
  const widget=(event.target as Element).closest("input,button,select,textarea");
  if(widget&&!(mod&&!event.altKey&&["z","y"].includes(key))){
   if(["Backspace","Delete"].includes(event.key)&&widget.matches("button,input[type=checkbox],input[type=radio]"))event.preventDefault();
   return;
  }
  if(this.#model.view.readOnly===true&&(["Backspace","Delete","Enter"].includes(event.key)||!mod&&!event.altKey&&[...event.key].length===1||mod&&!event.altKey&&["z","y","b","i","u","k"].includes(key))){event.preventDefault();return;}
  if(this.#model.view.selection?.kind==="document"&&this.#document){
   const side=({ArrowLeft:"before",ArrowUp:"before",Home:"before",PageUp:"before",ArrowRight:"after",ArrowDown:"after",End:"after",PageDown:"after",Escape:"before"} as const)[event.key as "ArrowLeft"];
   if(side&&!event.altKey&&!event.shiftKey){event.preventDefault();this.#attempt(()=>this.#perform(c=>{this.#document!.collapseDocumentSelection(side,c.revision);}));return;}
   if(!mod&&!event.altKey&&["Backspace","Delete","Enter"].includes(event.key)){event.preventDefault();this.#attempt(()=>this.#perform(c=>this.#replaceDocumentInput(c,event.key==="Enter"&&event.shiftKey?"\n":"",false)));return;}
   if(!mod&&!event.altKey&&[...event.key].length===1){event.preventDefault();this.#attempt(()=>this.#perform(c=>this.#replaceDocumentInput(c,event.key,true)));return;}
   if(side&&event.shiftKey)this.#logical=false;
  }
  const alignment=blockLayoutShortcut(event);
  if(alignment&&this.#options.core.supportsBlockLayout()){
   event.preventDefault();if(this.#model.view.readOnly===true)return;
   this.#attempt(()=>{this.#sync();if(this.#options.core.blockLayoutState().blocks!=="0")this.#perform(c=>{c.core.changeSelectionLayout({alignment},c.revision);});});return;
  }
  // No DOM range exists for a logical atom; a first printable key may have no
  // beforeinput. Cancel its default and send only the native replacement intent.
  if(!mod&&!event.altKey&&[...event.key].length===1&&isStructuralRichLanguage(this.#options.core.richLanguageVersion())&&this.#options.core.supportsAtomEditing()&&selectedFlowAtom(this.#model)){
   event.preventDefault();this.#attempt(()=>{this.#sync();this.#perform(c=>{const paragraph=c.allocate("p");if(c.model.view.historyGrouping==="typing-v1")c.core.replaceAtomTypingText(paragraph,event.key,this.#clock(),c.revision);else c.core.replaceAtomPlainText(paragraph,event.key,c.revision);});});return;
  }
  if(isStructuralRichLanguage(this.#options.core.richLanguageVersion())&&this.#options.core.supportsFlowNavigation()){
   if(event.altKey&&!mod&&!event.shiftKey&&(event.key==="PageUp"||event.key==="PageDown")){
    // Refused ranges/boundaries still belong to this reserved logical shortcut.
    // Letting the browser PageDown default run would move/collapse the range.
    event.preventDefault();this.#attempt(()=>{this.#sync();const movement=event.key==="PageUp"?"before":"after";if(flowEdgeEligible(this.#model,movement))this.#perform(c=>{c.core.navigateFlow(movement,c.revision);});});return;
   }
   if(event.key==="Enter"&&!mod&&!event.altKey){this.#attempt(()=>{this.#sync();if(selectedFlowAtom(this.#model)){event.preventDefault();this.#perform(c=>{c.core.insertParagraphAdjacent(c.allocate("p"),event.shiftKey?"before":"after",c.revision);});}});if(event.defaultPrevented)return;}
  }
  // Independent of toolbar composition; never turn a selected range into code loss.
  if(mod&&event.key==="Enter"&&!event.shiftKey&&!event.altKey&&isStructuralRichLanguage(this.#options.core.richLanguageVersion())){
   event.preventDefault();this.#attempt(()=>{this.#sync();const s=this.#model.view.selection;
    if(s?.kind!=="text"||s.anchor.block!==s.focus.block||s.anchor.offset!==s.focus.offset||this.#model.nodes.get(s.focus.block)?.type!=="breditor/code-block")return;
    this.#perform(c=>{c.core.exitCodeBlock(c.allocate("p"),c.revision);});
   });return;
  }
  if(mod&&!event.altKey&&key==="a"){if(this.#document){event.preventDefault();this.#attempt(()=>this.#perform(c=>{this.#document!.selectDocument(c.revision);}));return;}this.#logical=false;}
  if(mod&&!event.altKey){const shortcut=`${event.shiftKey?"shift+":""}${key}`,control=this.#controls.find(item=>item.control.shortcut===shortcut);if(control){event.preventDefault();this.#attempt(()=>{this.#sync();control.view.activate();});return;}}
  const nativeShortcut=({b:"bold",i:"italic",u:"underline","shift+x":"strike"} as Record<string,string>)[`${event.shiftKey?"shift+":""}${key}`];
  if(mod&&!event.altKey&&nativeShortcut&&isStructuralRichLanguage(this.#options.core.richLanguageVersion())&&this.#options.core.supportsSelectionFormatting()&&this.#options.inlinePresentation){event.preventDefault();this.#attempt(()=>{this.#sync();this.#selectionFormat(nativeShortcut);});return;}
  if(mod&&!event.altKey&&["z","y","b"].includes(key)){event.preventDefault();this.#attempt(()=>{this.#sync();this.#perform(c=>{if(key==="b")bold(c);else if(key==="y"||event.shiftKey)c.core.redo(c.revision);else c.core.undo(c.revision);});});return;}
  // WebKit can report insertParagraph for Shift+Enter. Resolve the keyboard
  // contract here without changing composition, grid Enter or beforeinput targets.
  if(event.key==="Enter"&&event.shiftKey&&!mod&&!event.altKey){this.#attempt(()=>{this.#sync();if(this.#model.view.selection?.kind==="text"){event.preventDefault();this.#perform(c=>{const s=c.model.view.selection;if(c.model.view.rangeEditing==="general-v1"&&s?.kind==="text")c.core.replaceGeneralRangePlainText(s,"\n",c.allocate("range"),c.revision);else c.core.hardBreak(c.revision);});}});if(event.defaultPrevented)return;}
  if(this.#model.view.readOnly!==true&&event.key==="Tab"&&!mod&&!event.altKey){this.#attempt(()=>{this.#sync();const command=sharedTaskTab(this.#context(),event.shiftKey);if(command){event.preventDefault();this.#perform(c=>{c.core.dispatch({commands:[command]},c.revision);});}else if(sharedListTabApplies(this.#context(),event.shiftKey)){event.preventDefault();const backward=event.shiftKey;this.#perform(c=>sharedListTab(c,backward));}});if(event.defaultPrevented)return;}
  const s=this.#model.view.selection;if(s?.kind==="grid"){
   const moves:Record<string,Navigation>={ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down",Tab:event.shiftKey?"previous":"next",Home:mod?"tableStart":"rowStart",End:mod?"tableEnd":"rowEnd"},move=moves[event.key];
   if(move){this.#attempt(()=>this.#perform(c=>{const result=c.core.navigate(move,event.key!=="Tab"&&event.shiftKey,c.revision);if(event.key!=="Tab"||result.kind!=="boundary")event.preventDefault();}));return;}
   if(event.key==="Enter"||event.key==="Escape"){event.preventDefault();const block=this.#model.textBlocks.find(n=>{const cell=sourceCell(this.#model,id(n));return cell?.table===s.focus.table&&cell.row===s.focus.row&&cell.column===s.focus.column;});if(block)this.select(caret(id(block)));return;}
  }
  if((s?.kind==="node"||s?.kind==="grid")&&(event.key==="Backspace"||event.key==="Delete")){event.preventDefault();this.#attempt(()=>this.#perform(c=>removeSelection(c,event.key==="Backspace"?"before":"after")));}
 }
 #input(event:InputEvent):void{if(this.#model.view.readOnly===true){event.preventDefault();return;}if(this.#composition||event.isComposing)return;event.preventDefault();this.#attempt(()=>{const markdown=this.#captureMarkdownInput(event);this.#sync();if(markdown){this.#typeMarkdown(markdown,event.data!);return;}const kind=event.inputType;
  if(kind!=="insertText"&&!kind.startsWith("delete"))this.#boundary();
  const action=({formatBold:"bold",formatItalic:"italic",formatUnderline:"underline",formatStrikeThrough:"strike",formatSubscript:"subscript",formatSuperscript:"superscript"} as Record<string,string>)[kind],control=this.#controls.find(item=>item.control.id===action);if(control){control.view.activate();return;}
  if(this.#selectionFormat(action))return;
  let paragraph:RichInputRuleOutcome|undefined;
  this.#perform(c=>{if(kind==="historyUndo"){c.core.undo(c.revision);return;}if(kind==="historyRedo"){c.core.redo(c.revision);return;}if(kind==="formatBold"){bold(c);return;}
   if(c.model.view.selection?.kind==="document"&&this.#document){
    if(kind.startsWith("delete")){this.#replaceDocumentInput(c,"",false);return;}
    if(kind==="insertParagraph"||kind==="insertLineBreak"){this.#replaceDocumentInput(c,kind==="insertLineBreak"?"\n":"",false);return;}
    if((kind==="insertText"||kind==="insertReplacementText")&&event.data)this.#replaceDocumentInput(c,event.data,kind==="insertText");return;
   }
   if((kind==="insertParagraph"||kind==="insertLineBreak")&&isStructuralRichLanguage(c.core.richLanguageVersion())&&c.core.supportsFlowNavigation()&&selectedFlowAtom(c.model)){c.core.insertParagraphAdjacent(c.allocate("p"),kind==="insertLineBreak"?"before":"after",c.revision);return;}
   if(kind==="insertParagraph"&&this.#codeEnter(c)){paragraph=publishMarkdownInput(c.core,{text:"\n",namespace:this.#allocate("rule"),...(needsInputRuleSets(this.#inputRuleIds)?{rules:this.#inputRuleIds!,...(this.#typography?{typography:this.#typography}:{})}:{})},c.revision);return;}
   if(kind==="insertParagraph"){const range=event.getTargetRanges?.()[0],target=c.model.view.rangeEditing==="general-v1"&&range?readTarget(this.surface,range):null;paragraph=enter(c,target&&target.anchor.block!==target.focus.block?target:undefined,!!this.#inputRuleIds?.includes("autolink-v1")&&!this.#logical);return;}
   if(isStructuralRichLanguage(c.core.richLanguageVersion())&&c.core.supportsAtomEditing()&&selectedFlowAtom(c.model)){
    if(kind.startsWith("delete")){c.core.deleteAtom(c.allocate("p"),kind.includes("Backward")?"before":"after",c.revision);return;}
    if(kind==="insertText"||kind==="insertReplacementText"){const value=event.data??"";if(value){const paragraph=c.allocate("p");if(kind==="insertText"&&c.model.view.historyGrouping==="typing-v1")c.core.replaceAtomTypingText(paragraph,value,this.#clock(),c.revision);else c.core.replaceAtomPlainText(paragraph,value,c.revision);}return;}
   }
   const s=c.model.view.selection;if(s?.kind!=="text")return;const range=event.getTargetRanges?.()[0],target=range?readTarget(this.surface,range):null;
   if(c.model.view.rangeEditing==="general-v1"&&(kind==="insertText"||kind==="insertReplacementText"||kind==="insertLineBreak")){const value=kind==="insertLineBreak"?"\n":event.data??"",selection=target&&!isCurrentCaretTarget(s,target)?target:s,prefix=c.allocate("range");if(kind==="insertText"&&c.model.view.historyGrouping==="typing-v1")c.core.replaceGeneralRangeTypingText(selection,value,prefix,this.#clock(),c.revision);else c.core.replaceGeneralRangePlainText(selection,value,prefix,c.revision);return;}
   if(kind==="insertText"||kind==="insertReplacementText"||kind==="insertLineBreak"){const value=kind==="insertLineBreak"?"\n":event.data??"";if(target&&!isCurrentCaretTarget(s,target))c.core.replace(target,value,c.revision);else if(kind==="insertLineBreak")c.core.hardBreak(c.revision);else if(kind==="insertText"&&c.model.view.historyGrouping==="typing-v1"&&s.anchor.block===s.focus.block&&s.anchor.offset===s.focus.offset)c.core.typeUser(value,this.#clock(),c.revision);else c.core.type(value,c.revision);return;}
   if(kind.startsWith("delete")){const backward=kind.includes("Backward");if(boundaryDelete(c,backward))return;if(s.anchor.block!==s.focus.block||s.anchor.offset!==s.focus.offset){if(c.model.view.rangeEditing==="general-v1")c.core.replaceGeneralRangePlainText(s,"",c.allocate("range"),c.revision);else c.core.replace(s,"",c.revision);return;}if(target&&(target.anchor.block!==target.focus.block||target.anchor.offset!==target.focus.offset)){this.#deleteInput(c,target,backward,kind);return;}
    const n=c.model.nodes.get(s.focus.block);if(!n)return;const content=text(n),offset=Number(s.focus.offset),segments=[...new Intl.Segmenter(undefined,{granularity:kind.includes("Word")?"word":"grapheme"}).segment(content)],start=backward?segments.filter(v=>v.index<offset).at(-1)?.index??0:offset,end=backward?offset:segments.find(v=>v.index>offset)?.index??content.length;
    this.#deleteInput(c,{kind:"text",anchor:{...s.focus,offset:String(start)},focus:{...s.focus,offset:String(end)}},backward,kind);
   }
  },true,this.#model.view.revision,false,()=>{if(paragraph==="refused")this.#inputRuleRefused();});
 });}
 #copy(event:ClipboardEvent,cut:boolean):void{
  if(!event.clipboardData)return;if(this.#composition||this.#busy){event.preventDefault();return;}if(this.#model.view.rangeEditing==="general-v1")event.preventDefault();this.#boundary();
  this.#attempt(()=>{this.#sync();const revision=this.#model.view.revision;let formats:readonly RichInterchangeFormatReport[]=[],operation:RichClipboardInterchangeReport["operation"]|undefined;this.#perform(c=>{
   const whole=c.model.view.selection?.kind==="document",general=c.model.view.rangeEditing==="general-v1",content=whole?this.#documentOwner().copyDocument():general?c.core.copyGeneral():c.core.copy();if(!content)return;
   event.preventDefault();const extra=exportClipboard(content.richJson,this.#interchange);writeClipboard(event.clipboardData!,content.plainText,content.richJson,extra,whole);formats=extra?.formats??[];
   if(cut&&c.model.view.readOnly!==true){const selection=c.model.view.selection;if(whole)this.#replaceDocumentInput(c,"",false);else if(general&&selection?.kind==="text")c.core.replaceGeneralRangePlainText(selection,"",c.allocate("range"),c.revision);else removeSelection(c);operation="cut";}else operation="copy";
  },false,revision,false,display=>{if(operation)this.#clipboardComplete(operation,revision,formats,undefined,display);});});
 }
 #paste(event:ClipboardEvent):void{const mode=this.#markdownPaste.mode();if(this.#model.view.readOnly===true){event.preventDefault();return;}if(!event.clipboardData)return;event.preventDefault();if(this.#composition||this.#busy)return;
  this.#boundary();
  this.#attempt(()=>{const transfer=event.clipboardData!,foreign=mode!=="literal"&&this.#interchange&&transfer.types.some(t=>["application/x-breditor-rich+json","text/html","text/markdown"].includes(t)),files=[...transfer.files];if(files.length&&!foreign){this.#files(files);return;}
   this.#pasteInput(grid=>readClipboardInput(transfer,this.#interchange,grid,mode));
  });
 }
 #pasteInput(read:(grid:boolean)=>ClipboardInput):void {
  this.#sync();const revision=this.#model.view.revision,selection=this.#model.view.selection;let input=read(selection?.kind==="grid");
  // An automatic conversion never flattens into code or a caption: there the literal text is what was copied.
  if(input.markdownPaste&&selection?.kind==="text"&&(this.#model.nodes.get(selection.focus.block)?.type==="breditor/code-block"||(JSON.parse(input.fragment) as {kind:string}).kind==="flow"&&this.#options.core.supportsClipboardTextPolicy()&&this.#options.core.projectClipboardText(selection,input.fragment,revision)!==null))input={fragment:"",plain:input.markdownPaste.plain,formats:[]};
  const detected=input,fragment=input.fragment,plain=input.plain;if(!fragment&&!plain)return;
  let projection:RichClipboardTextProjection|undefined;
  this.#perform(c=>{
   const s=c.model.view.selection,general=c.model.view.rangeEditing==="general-v1";
   if(s?.kind==="document"&&this.#document){if(fragment)this.#document.pasteDocumentClipboard(fragment,c.allocate("paste"),c.revision);else this.#replaceDocumentInput(c,plain,false);return;}
   if(!fragment){if(general&&s?.kind==="text")c.core.replaceGeneralRangePlainText(s,plain,c.allocate("range"),c.revision);else if(isStructuralRichLanguage(c.core.richLanguageVersion())&&c.core.supportsAtomEditing()&&selectedFlowAtom(c.model))c.core.replaceAtomPlainText(c.allocate("p"),plain,c.revision);else c.core.type(plain,c.revision);return;}
   const kind=(JSON.parse(fragment) as {kind:string}).kind,prefix=c.allocate("paste");
   if(kind==="text"){if(general&&s?.kind==="text")c.core.pasteGeneralInlineClipboard(s,fragment,prefix,c.revision);else c.core.paste(fragment,{kind:"text"},prefix,c.revision);}
   else if(kind==="grid"&&s?.kind==="grid")c.core.paste(fragment,{kind:"grid"},prefix,c.revision);
   else if(s?.kind==="text"){
    const converted=c.core.supportsClipboardTextPolicy()?c.core.projectClipboardText(s,fragment,c.revision):null;
    if(converted){if(general)c.core.replaceGeneralRangePlainText(s,converted.text,prefix,c.revision);else c.core.replace(s,converted.text,c.revision);projection=converted;}
    else if(general)c.core.pasteGeneralFlowClipboard(s,fragment,c.allocate("right"),prefix,c.revision);else c.core.pasteAtText(fragment,c.allocate("right"),prefix,c.revision);
   }
   else c.core.paste(fragment,{kind:"flow",...positionAfter(c)},prefix,c.revision);
  },true,revision,false,display=>{this.#clipboardComplete("paste",revision,detected.formats,projection,display);this.#markdownPaste.accepted(detected,revision,this.#options.core.view().revision,display,(after,text)=>this.#undoMarkdownPaste(after,text));});
 }
 /** One native Undo of the accepted conversion, then one literal paste at the restored selection. */
 #undoMarkdownPaste(revision:string,plain:string):boolean{
  if(this.#disposed||this.#busy||this.#composition||this.#model.view.readOnly===true||this.#options.core.view().revision!==revision)return false;
  let undone=false;this.#perform(c=>{undone=c.core.undo(c.revision);},true,revision);
  if(undone)this.pasteText(plain,"literal");return undone;
 }
 #clipboardComplete(operation:RichClipboardInterchangeReport["operation"],revision:string,formats:readonly RichInterchangeFormatReport[],destination?:RichClipboardTextProjection,display=true):void {
  if(this.#disposed)return;
  if(this.#interchange&&(formats.length||destination)){const report=clipboardInterchangeReport(operation,revision,formats,destination),message=clipboardInterchangeStatus(report,this.#ui);if(display&&message)this.status.textContent=message;try{this.#options.onInterchange?.(report);}catch(error){this.#report(error);}}
  if(destination){if(display&&!this.#interchange)this.#pasteLoss(destination);else try{this.#options.onPasteLoss?.(destination);}catch(error){this.#report(error);}}
 }
 #pasteLoss(report:RichClipboardTextProjection):void{this.status.textContent=this.#ui.text("pasteLoss",clipboardProjectionText(report,this.#ui));try{this.#options.onPasteLoss?.(report);}catch(error){this.#report(error);}}
 #files(files:readonly File[]):void{if(this.#options.core.view().readOnly===true)return;this.#boundary();this.#attempt(()=>{this.#sync();if(this.#model.view.selection?.kind==="document"){if(!this.#options.onDocumentFiles)throw Error("Whole-document image replacement requires a document-aware asset host");void Promise.resolve(this.#options.onDocumentFiles(files,this.#model.view.revision)).catch(error=>this.#report(error));return;}if(!this.#options.onFiles)throw Error("Image files require an asset host");const position=positionAfter(this.#context()),revision=this.#model.view.revision;void Promise.resolve(this.#options.onFiles(files,position,revision)).catch(error=>this.#report(error));});}
 #replaceDocumentInput(c:ActionContext<P>,text:string,typing:boolean):void{const core=this.#documentOwner(),paragraph=c.allocate("p");if(typing&&c.model.view.historyGrouping==="typing-v1")core.replaceDocumentTypingText(paragraph,text,this.#clock(),c.revision);else core.replaceDocumentPlainText(paragraph,text,c.revision);}
 #startComposition():void{if(this.#composition||this.#model.view.readOnly===true)return;this.#boundary();this.#attempt(()=>{if(this.#model.view.readOnly===true)return;this.#sync();const s=this.#model.view.selection;if(s?.kind==="document"&&this.#document){this.#composition={document:true,revision:this.#model.view.revision,release:this.#options.core.holdRemotes()};return;}if(s?.kind!=="text")return;const cross=s.anchor.block!==s.focus.block;if(cross&&this.#model.view.rangeEditing!=="general-v1")return;const n=this.#model.nodes.get(s.focus.block);if(n)this.#composition={block:id(n),original:text(n),revision:this.#model.view.revision,release:this.#options.core.holdRemotes(),...(cross?{target:structuredClone(s)}:{})};});this.#notifySearch();}
 #finishComposition(composition:Composition,pending:Work<P>[],force:boolean):void{try{for(const work of pending)this.#attempt(()=>{try{this.#perform(work.run,work.focus,work.revision,work.boundary,work.accepted,work.completion);}catch(error){work.completion?.reject(error);throw error;}});this.#refresh(false,force);}finally{composition.release();this.#notifySearch();}}
 #endComposition(committedText:string):void{const composition=this.#composition;if(!composition)return;this.surface.ownerDocument.defaultView?.requestAnimationFrame(()=>{
  if(this.#disposed||this.#composition!==composition)return;
  if("document" in composition){
   this.#composition=undefined;const pending=this.#queue;this.#queue=[];
   try{if(committedText)this.#perform(c=>{this.#documentOwner().replaceDocumentPlainText(c.allocate("p"),committedText,c.revision);},true,composition.revision);}
   catch(error){this.#report(error);}
   finally{this.#finishComposition(composition,pending,true);}
   return;
  }
  if(composition.target){
   this.#composition=undefined;const pending=this.#queue;this.#queue=[];
   try{if(committedText)this.#perform(c=>{c.core.replaceGeneralRangePlainText(composition.target!,committedText,c.allocate("range"),c.revision);},true,composition.revision);}
   catch(error){this.#report(error);}
   finally{this.#finishComposition(composition,pending,true);}
   return;
  }
  if(this.#disposed||this.#composition!==composition)return;const node=[...this.surface.querySelectorAll<HTMLElement>("[data-rich-text]")].find(n=>n.dataset["richText"]===composition.block),final=node?.textContent??composition.original;let start=0;while(start<composition.original.length&&start<final.length&&composition.original[start]===final[start])start++;if(start>0&&/[\uDC00-\uDFFF]/.test(composition.original[start]??final[start]??""))start--;
  let oldEnd=composition.original.length,newEnd=final.length;while(oldEnd>start&&newEnd>start&&composition.original[oldEnd-1]===final[newEnd-1]){oldEnd--;newEnd--;}if(oldEnd<composition.original.length&&/[\uDC00-\uDFFF]/.test(composition.original[oldEnd]??"")){oldEnd++;newEnd++;}
  this.#composition=undefined;const pending=this.#queue;this.#queue=[];
  try{if(composition.original!==final){const point={block:composition.block,affinity:"after" as const};this.#perform(c=>{c.core.replace({kind:"text",anchor:{...point,offset:String(start)},focus:{...point,offset:String(oldEnd)}},final.slice(start,newEnd),c.revision);},true,composition.revision);}}
  catch(error){this.#report(error);}finally{this.#finishComposition(composition,pending,true);}
 });}
 dispose():void{if(this.#disposed)return;this.#disposed=true;this.#placeholder?.dispose();this.#unsubscribe();this.#abort.abort();this.#cancelQueue(Error("The shared DOM editor is disposed"));this.#notifySearch();this.#searchEvents.clear();this.#writingEvents.clear();if(this.#options.coreOwnership!=="borrow")this.#options.core.dispose();this.#composition?.release();this.#composition=undefined;releaseRichTableScroll(this.surface);this.#root.replaceChildren();delete this.#root.dataset["breditorShared"];}
}
export const mountSharedEditor=(root:HTMLElement,options:SharedDomOptions):SharedDomEditor=>new SharedDomEditor(root,options);
/** Explicit extended coordinator; the default mount/execute/selection DTOs remain closed. */
export const mountSharedDocumentEditor=(root:HTMLElement,options:SharedDocumentDomOptions):SharedDomEditor<"document-v1">=>new SharedDomEditor<"document-v1">(root,options);
const styles=`[data-breditor-shared]{color:#173d37;font:15px system-ui,sans-serif}[data-breditor-shared] .breditor-shared-toolbar{display:flex;gap:5px;flex-wrap:wrap;align-items:end;background:#edf2ef;padding:10px;border:1px solid #b6c7bf}[data-breditor-shared] button{padding:5px 8px;background:white;border:1px solid #a5b9af;border-radius:4px;color:inherit}[data-breditor-shared] button:disabled{opacity:.4}[data-breditor-shared] label{display:grid;font-size:11px;gap:3px}[data-breditor-shared] input{width:100px;padding:5px}[data-breditor-shared] .breditor-shared-surface{min-height:220px;padding:18px;border:1px solid #b6c7bf;background:white;outline:none;white-space:pre-wrap}[data-breditor-shared] .breditor-shared-surface:focus{box-shadow:inset 0 0 0 2px #378a77}[data-breditor-shared] p{min-height:1em}[data-breditor-shared] table{border-collapse:collapse;margin:10px 0;table-layout:fixed}[data-breditor-shared] td,[data-breditor-shared] th{border:1px solid #819e90;min-width:90px;padding:8px;vertical-align:top}[data-breditor-shared] [data-selected]{background:#e0f4e9}[data-breditor-shared] [data-node-selected]{outline:2px solid #378a77}[data-breditor-shared] figure{margin:10px 0;border:1px solid #a5b9af;padding:10px}[data-breditor-shared] img{max-width:100%;display:block}[data-breditor-shared] [data-source-cell]+[data-source-cell]{border-top:1px dashed #a5b9af}`;
