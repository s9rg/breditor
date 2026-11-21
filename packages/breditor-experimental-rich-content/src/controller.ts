import {isStructuralRichLanguage} from "./rich_language.js";
// One DOM coordinator around the exclusive Rust owner. Rendering and callbacks cannot publish reentrantly.
import type {FlowPosition,RichCommand,RichCommandOutcome,RichCoreEditor,RichSelection,RichDocumentSelection,RichSelectionPolicy,RichEditorView,RichDocumentCoreEditor,RichRestrictedPolicy} from "./core.js";
import {bold,boundaryDelete,defaultToolbarFor,deleteSelection,enter,positionAfter,type ActionContext,type ToolbarControl} from "./actions.js";
import {id,presentationModel,sourceCell,text,type RichModel} from "./model.js";
import {paintSelection,render,requireRenderOptions,structuralBlockStylesV2,type RenderOptions} from "./render.js";
import {richPageBreakStyles} from "./page_break.js";
import {richBookmarkStyles} from "./bookmark.js";
import {readNative,readTarget,restoreDocumentNative,nativeSelectsDocument,isCurrentCaretTarget} from "./selection.js";
import {documentSelectionStyles} from "./document_selection_presentation.js";
import {requireDocumentBrowserCore} from "./document_core.js";
import {isDocumentIntent,publishDocumentIntent,type DocumentIntent} from "./document_intent.js";
import {standardInlineStylesV1} from "./standard_inline_v1.js";
import {mountToolbarControl,toolbarControlStyles,type RichControlView} from "./toolbar_control_view.js";
import {resolveRichUi,type RichUiLocale,type RichUiOptions} from "./ui_locale.js";
import {taskTab} from "./task_actions_v2.js";
import {captionArrowCommands} from "./table_caption_navigation.js";
import {flowEdgeEligible,selectedFlowAtom} from "./flow_controls.js";
import {standardSelectionInlineControls,selectionFormatChanges} from "./standard_inline_controls.js";
import {blockLayoutShortcut} from "./block_layout_controls.js";
import {encodeBlockLayoutPatch} from "./block_layout_serialization.js";
import {encodeListNumberingPatch} from "./list_numbering_serialization.js";
import type {RichClipboardTextProjection} from "./core.js";
import {requireClipboardInterchange,readClipboardInput,exportClipboard,writeClipboard,clipboardInterchangeReport,clipboardInterchangeStatus,clipboardProjectionText,type RichClipboardInterchange,type RichClipboardInterchangeReport,type RichInterchangeFormatReport} from "./clipboard_interchange.js";
import type {RichSearchQuery,RichSearchReplacement,RichSearchResults} from "./core.js";
import {RichSearchEvents,type RichSearchHostState,type RichSearchCompletion} from "./search_host.js";
import {publishRichSearchIntent,type RichSearchIntent} from "./search_intent.js";
import {requireInputRules,inputRuleTypography,needsInputRuleSets,isPlainInputScalar,captureMarkdownInputSource,checkMarkdownInputSource,publishMarkdownInput,type MarkdownInputIntent,type MarkdownInputSource,type RichInputRulesOption} from "./input_rule_intent.js";
import type {RichInputRuleId,RichInputRuleOutcome,RichTypographyOptions} from "./core.js";
import type {RichWritingToolsRead} from "./writing_tools_types.js";
import {RichWritingEvents,RichWritingReadRegistry,type RichWritingToolsHostState} from "./writing_tools_host.js";
import {prepareRichPlaceholder,RichPlaceholderPresentation,richPlaceholderStyles} from "./placeholder.js";
import {borrowContextControl,contextSelectionKind,type BorrowedControl} from "./context_ui_host.js";
import type {RichContextControlView,RichContextUiHostState} from "./context_ui_types.js";
import {createDocumentSourceHost} from "./source_view_host.js";
import {richCoordinatorShortcuts,type RichShortcutEntry} from "./shortcut_registry.js";
import type {RichDocumentSourceHost} from "./source_view_types.js";

export interface RichEditorOptions<P extends RichSelectionPolicy="original"> extends RenderOptions {
 core:RichCoreEditor<P>;
 /** Explicit and immutable. Original mount/factory defaults never adopt extended views. */
 selectionEditing?:P;
 /** Immutable explicit native general-range routing; default keeps original input contracts. */
 rangeEditing?:"original"|"general-v1";
 /** Immutable explicit browser policy (`markdown-v1`, `autolink-v1`, `typography-v1` or a configured typography entry, alone or listed); omitted keeps literal ordinary input. */
 inputRules?:RichInputRulesOption;
 /** Literal input committed, but native shortcut conversion was refused; never retry input. */
 onInputRuleRefused?:()=>void;
 toolbar?:readonly ToolbarControl<P>[];
 label?:string;
 /** Opt-in chrome catalog and chrome `dir`/`lang`. Never changes the editing surface or content direction. */
 ui?:RichUiOptions;
 /** Initial label for admitted native prompt mode; omission preserves existing DOM/defaults. */
 placeholder?:string;
 onChange?:(view:RichEditorView<P>,outcome:RichCommandOutcome)=>void;
 onError?:(error:unknown)=>void;
 /** Called only after an explicitly selected caption/code text paste successfully publishes. */
 onPasteLoss?:(report:RichClipboardTextProjection)=>void;
 /** Explicit parser port. Omission preserves existing private-rich/plain clipboard behavior. */
 clipboardInterchange?:RichClipboardInterchange;
 /** Delivered only after retained Copy or accepted native Cut/Paste, including queued work. */
 onInterchange?:(report:RichClipboardInterchangeReport)=>void;
 onFiles?:(files:readonly File[],position:FlowPosition)=>void|Promise<void>;
 /** A document-aware asset host must retain this guard and submit one whole-document rich paste. */
 onDocumentFiles?:(files:readonly File[],revision:string)=>void|Promise<void>;
}
export type RichDocumentEditorOptions=Omit<RichEditorOptions<"document-v1">,"core"|"selectionEditing"|"rangeEditing">&{core:RichDocumentCoreEditor;selectionEditing:"document-v1";rangeEditing?:"general-v1"};
function sameSelection(a:RichDocumentSelection|null,b:RichDocumentSelection|null):boolean {
 if(a?.kind!==b?.kind)return false;if(!a||!b)return a===b;
 if(a.kind==="node"&&b.kind==="node")return a.block===b.block;
 if(a.kind==="document"&&b.kind==="document")return true;
 if(a.kind==="grid"&&b.kind==="grid")return a.anchor.table===b.anchor.table&&a.anchor.row===b.anchor.row&&a.anchor.column===b.anchor.column&&a.focus.table===b.focus.table&&a.focus.row===b.focus.row&&a.focus.column===b.focus.column;
 if(a.kind==="text"&&b.kind==="text")return a.anchor.block===b.anchor.block&&a.anchor.offset===b.anchor.offset&&a.anchor.affinity===b.anchor.affinity&&a.focus.block===b.focus.block&&a.focus.offset===b.focus.offset&&a.focus.affinity===b.focus.affinity;
 return false;
}
type Work={revision:string;focus:boolean;accepted?:((display:boolean)=>void)|undefined;completion?:RichSearchCompletion}&({command:RichCommand|DocumentIntent;search?:never;inputRule?:never;paragraph?:never;region?:never}|{command?:never;search:RichSearchIntent;inputRule?:never;paragraph?:never;region?:never}|{command?:never;search?:never;inputRule:MarkdownInputIntent;paragraph?:never;region?:never}|{command?:never;search?:never;inputRule?:never;paragraph:{right:string;newItem:string|null};region?:never}|{command?:never;search?:never;inputRule?:never;paragraph?:never;region:"next"|"previous"});
/** A paragraph with no text and no inline atoms: where the empty-line block menu may appear. */
const emptyParagraph=(node:{type:string;children:readonly {kind:string;text?:string}[]}|undefined):boolean=>node?.type==="breditor/paragraph"&&node.children.every(child=>child.kind==="text"&&!child.text);
type Composition={block:string;original:string;revision:string;finishing:boolean;target?:Extract<RichSelection,{kind:"text"}>}|{document:true;revision:string;finishing:boolean};
export class RichDomEditor<P extends RichSelectionPolicy="original"> {
 readonly surface:HTMLDivElement;
 readonly toolbar:HTMLDivElement;
 readonly status:HTMLParagraphElement;
 #root:HTMLElement;#options:RichEditorOptions<P>;#bookmarks=false;#ui:RichUiLocale;#model:RichModel<P>;#abort=new AbortController();#queue:Work[]=[];#busy=false;#disposed=false;#composition:Composition|undefined;
 #namespace:string;#counter=0n;#logicalSelection=false;#controls:{control:ToolbarControl<P>;view:RichControlView<ActionContext<P>>}[]=[];
 readonly #borrowed=new Set<BorrowedControl<ToolbarControl<P>,ActionContext<P>>>();
 readonly #selectionPolicy:P;readonly #document:RichDocumentCoreEditor|undefined;
 #general=false;
 readonly #interchange:RichClipboardInterchange|undefined;
 readonly #inputRules:boolean;readonly #inputRuleIds:readonly RichInputRuleId[]|null;readonly #typography:RichTypographyOptions|null;
 readonly #searchEvents=new RichSearchEvents();
 readonly #writingEvents=new RichWritingEvents();readonly #writingReads=new RichWritingReadRegistry();
 readonly #placeholder:RichPlaceholderPresentation|undefined;
 constructor(root:HTMLElement,options:RichEditorOptions<P>&(P extends "document-v1"?RichDocumentEditorOptions:unknown)){
  const policy=options.selectionEditing??"original";
  if(policy!=="original"&&policy!=="document-v1")throw new TypeError("Expected selectionEditing original or document-v1");
  if((options.core.selectionPolicy?.()??"original")!==policy)throw Error("DOM selection policy must match its explicitly selected native owner");
  this.#selectionPolicy=policy as P;this.#document=policy==="document-v1"?requireDocumentBrowserCore(options.core):undefined;
  this.#interchange=requireClipboardInterchange(options.clipboardInterchange,options.core);
  this.#inputRuleIds=requireInputRules(options.inputRules,options.core);this.#typography=inputRuleTypography(options.inputRules);this.#inputRules=this.#inputRuleIds!==null;
  const placeholder=prepareRichPlaceholder(options.placeholder,options.core);
  if(options.rangeEditing!==undefined&&options.rangeEditing!=="original"&&options.rangeEditing!=="general-v1")throw new TypeError("Expected rangeEditing original or general-v1");
  if(this.#document&&options.rangeEditing==="original")throw Error("Document selection requires native general-range browser routing");
  this.#general=!!this.#document||options.rangeEditing==="general-v1";
  if(this.#general&&options.core.supportsGeneralRanges?.()!==true)throw Error("Use a matching native general-range owner");
  this.#root=root;this.#options=options;this.#model=this.#read();this.#namespace=`br:${crypto.randomUUID()}`;this.#logicalSelection=this.#logical();
  requireRenderOptions(this.#model,options);
  if(this.#model.view.historyGrouping==="typing-v1"&&(options.core.supportsTypingHistory?.()!==true||!options.core.closeTypingGroup))throw Error("Use matching native natural typing history");
  for(const control of options.toolbar??defaultToolbarFor<P>())if(control.owner!==undefined&&control.owner!==options.core)throw Error("Toolbar control belongs to a different Rust owner");
  const ui=resolveRichUi(options.ui);ui.checkControls(options.toolbar??defaultToolbarFor<P>());this.#ui=ui;
  const document=root.ownerDocument;this.surface=document.createElement("div");this.surface.className="breditor-rich-surface";this.surface.contentEditable="true";this.surface.setAttribute("role","textbox");this.surface.setAttribute("aria-multiline","true");this.surface.setAttribute("aria-label",options.label??ui.text("richEditorLabel"));
  this.toolbar=document.createElement("div");this.toolbar.className="breditor-rich-toolbar";this.toolbar.setAttribute("role","toolbar");this.toolbar.setAttribute("aria-label",ui.text("richToolbarLabel"));ui.applyChrome(this.toolbar);
  this.status=document.createElement("p");this.status.className="breditor-rich-status";this.status.setAttribute("role","status");ui.applyChrome(this.status);
  this.#placeholder=placeholder?new RichPlaceholderPresentation(this.surface,placeholder.label):undefined;
  const style=document.createElement("style");style.textContent=styles+standardInlineStylesV1+toolbarControlStyles+structuralBlockStylesV2+richPageBreakStyles+richBookmarkStyles+(this.#document?documentSelectionStyles:"")+(placeholder?richPlaceholderStyles:"");root.dataset["breditorRich"]="";root.replaceChildren(style,this.toolbar,this.#placeholder?.container??this.surface,this.status);
  const seen=new Set<string>();
  for(const control of options.toolbar??defaultToolbarFor<P>()){
   if(seen.has(control.id))throw Error("Duplicate rich toolbar control identity");seen.add(control.id);
   const view=this.#mountControl(this.toolbar,control,this.#abort.signal);
   this.#controls.push({control,view});
  }
  this.#bookmarks=options.core.supportsBookmarks?.()===true;
  render(this.surface,this.#model,this.#renderOptions());this.#refreshControls();
  if(this.#placeholder){this.#placeholder.update(placeholder!.empty&&this.#model.view.readOnly!==true);this.#writingEvents.subscribe(()=>this.#refreshPlaceholder());}
  if(this.#model.view.readOnly===true)this.status.textContent=ui.text("richStatusReadOnly",{revision:this.#model.view.revision});
  this.surface.addEventListener("beforeinput",event=>this.#input(event as InputEvent),{signal:this.#abort.signal});
  this.surface.addEventListener("input",()=>{if(!this.#composition)this.#reconcile();},{signal:this.#abort.signal});
  this.surface.addEventListener("keydown",event=>this.#key(event),{signal:this.#abort.signal});
  this.surface.addEventListener("pointerdown",event=>this.#pick(event),{signal:this.#abort.signal});
  this.surface.addEventListener("blur",()=>this.#boundary(),{capture:true,signal:this.#abort.signal});
  this.toolbar.addEventListener("pointerdown",()=>this.#boundary(),{capture:true,signal:this.#abort.signal});
  this.toolbar.addEventListener("focusin",()=>this.#boundary(),{capture:true,signal:this.#abort.signal});
  this.surface.addEventListener("click",event=>this.#taskCheck(event),{signal:this.#abort.signal});
  // V4 image links are inert while editing: activation never navigates the editable surface.
  for(const type of ["click","auxclick"])this.surface.addEventListener(type,event=>this.#inertImageLink(event),{capture:true,signal:this.#abort.signal});
  if(this.#bookmarks)for(const type of ["click","auxclick"])this.surface.addEventListener(type,event=>this.#internalLink(event),{capture:true,signal:this.#abort.signal});
  // V4 sections never toggle natively while editing: a summary click only places the caret,
  // and any browser-initiated toggle (find-in-page, fragment reveal) is reverted to document state.
  this.surface.addEventListener("click",event=>this.#inertSummary(event),{capture:true,signal:this.#abort.signal});
  this.surface.addEventListener("toggle",event=>this.#restoreDetails(event),{capture:true,signal:this.#abort.signal});
  this.surface.addEventListener("copy",event=>this.#copy(event,false),{signal:this.#abort.signal});
  this.surface.addEventListener("cut",event=>this.#copy(event,true),{signal:this.#abort.signal});
  this.surface.addEventListener("paste",event=>this.#paste(event),{signal:this.#abort.signal});
  this.surface.addEventListener("dragover",event=>{if(event.dataTransfer?.types.includes("Files"))event.preventDefault();},{signal:this.#abort.signal});
  this.surface.addEventListener("drop",event=>{if(event.dataTransfer?.files.length){event.preventDefault();this.#files([...event.dataTransfer.files]);}},{signal:this.#abort.signal});
  this.surface.addEventListener("compositionstart",()=>this.#startComposition(),{signal:this.#abort.signal});
  this.surface.addEventListener("compositionend",event=>this.#endComposition(event.data),{signal:this.#abort.signal});
  document.addEventListener("selectionchange",()=>{if(!this.#busy&&!this.#composition)this.#attempt(()=>this.#sync());},{signal:this.#abort.signal});
  this.#placeholder?.activate();
 }
 #live():void {if(this.#disposed)throw Error("The rich DOM editor is disposed");}
 #allocate=(kind:string):string=>`${this.#namespace}:${kind}:${this.#counter++}`;
 #read():RichModel<P>{return presentationModel<P>(this.#options.core.view(),this.#selectionPolicy);}
 #logical():boolean {return ["grid","node","document"].includes(this.#model.view.selection?.kind??"");}
 #context():ActionContext<P>{return {core:this.#options.core,model:this.#model,allocate:this.#allocate,stamp:()=>({replica:"1",counter:String(this.#counter++),lamport:this.#model.view.revision})};}
 #attempt(work:()=>void):void {try{work();}catch(error){this.#report(error);this.#reconcile();}}
 #report(error:unknown):void {this.status.textContent=this.#ui.describe(error,this.#ui.text("richOperationFailed"));try{this.#options.onError?.(error);}catch{/* A host callback cannot rewind committed content. */}}
 #mountControl(container:HTMLElement,control:ToolbarControl<P>,signal:AbortSignal):RichControlView<ActionContext<P>>{
  return mountToolbarControl(container,control,{prefix:"rich",ui:this.#ui,surface:this.surface,signal,sync:()=>this.#sync(),stamp:()=>JSON.stringify(this.#options.core.view()),attempt:work=>this.#attempt(work),focus:()=>this.focus(),run:(value,fields)=>{const command=control.command(this.#context(),value,fields);if(command)this.execute(command);}});
 }
 /** Context UI port: the same admitted control, widget, gating and command path, in another presentation. */
 contextUiState():RichContextUiHostState{const view=this.#model.view,selection=contextSelectionKind(view.selection);return Object.freeze({revision:view.revision,closed:this.#disposed,busy:this.#busy,composing:!!this.#composition,readOnly:view.readOnly===true,selection,emptyParagraph:selection==="caret"&&emptyParagraph(this.#model.nodes.get((view.selection as Extract<RichSelection,{kind:"text"}>).focus.block))});}
 /** Editor shell port: the chords this coordinator's keydown routing owns, from the same controls and capabilities. */
 contextShortcuts():readonly RichShortcutEntry[]{
  const core=this.#options.core,structural=isStructuralRichLanguage(core.richLanguageVersion?.());
  return richCoordinatorShortcuts({ui:this.#ui,controls:this.#controls.map(entry=>entry.control),structural,selectionFormatting:core.supportsSelectionFormatting?.()===true&&!!this.#options.inlinePresentation,flowNavigation:core.supportsFlowNavigation?.()===true,blockLayout:core.supportsBlockLayout?.()===true});
 }
 subscribeContextUi(listener:()=>void):()=>void{this.#live();return this.#writingEvents.subscribe(listener);}
 /** The validated chrome catalog; opt-in tools read their strings and chrome direction from it. */
 uiLocale():RichUiLocale{return this.#ui;}
 contextControlIds():readonly string[]{return Object.freeze(this.#controls.map(entry=>entry.control.id));}
 mountContextControl(container:HTMLElement,id:string,signal:AbortSignal):RichContextControlView{
  this.#live();const entry=this.#controls.find(item=>item.control.id===id);if(!entry)throw Error(`Toolbar control ${id} is not admitted by this editor`);
  return borrowContextControl({surface:this.surface,editor:this.#abort.signal,container,signal,mount:abort=>this.#mountControl(container,entry.control,abort),boundary:()=>this.#boundary(),borrowed:this.#borrowed,control:entry.control,refresh:item=>this.#refreshControls(item)});
 }
 #refreshControls(only?:{control:ToolbarControl<P>;view:RichControlView<ActionContext<P>>}):void {
  const context=this.#context(),stamp=JSON.stringify(this.#options.core.view());for(const {control,view} of only?[only]:[...this.#controls,...this.#borrowed])view.refresh(context,control.enabled(context)&&(this.#model.view.readOnly!==true&&this.#model.view.restricted?.selectionEditable!==false||control.readOnlySafe===true),stamp);
 }
 #reconcile():void {if(this.#disposed||this.#composition)return;this.#model=this.#read();this.#logicalSelection=this.#logical();render(this.surface,this.#model,this.#renderOptions());restoreDocumentNative(this.surface,this.#model.view.selection);this.#refreshControls();}
 #sync():void {
  if(this.#composition||this.#busy||this.#logicalSelection)return;
  // Rendering while a host control owns focus can leave a collapsed browser
  // range in this surface. It is not an intentional editor selection change.
  const active=this.surface.ownerDocument.activeElement;
  if(active!==this.surface&&(!active||!this.surface.contains(active)))return;
  if(this.#document&&nativeSelectsDocument(this.surface)){this.#executeIntent({kind:"selectDocument"},false);return;}
  const selection=readNative(this.surface,this.#model,this.#general?"general-v1":"original");
  if(selection&&!sameSelection(selection,this.#model.view.selection))this.execute({kind:"setSelection",selection},false);
 }
 #captureMarkdownInput(event:InputEvent):MarkdownInputSource|null {
  if(!this.#inputRules||event.inputType!=="insertText"||!isPlainInputScalar(event.data??"")||this.#logicalSelection)return null;
  const ranges=event.getTargetRanges?.()??[];if(ranges.length>1)return null;
  const target=ranges[0]?readTarget(this.surface,ranges[0]):null;if(ranges.length&&!target)return null;
  const active=this.surface.ownerDocument.activeElement,owned=active===this.surface||!!active&&this.surface.contains(active);
  if(this.#document&&owned&&nativeSelectsDocument(this.surface))return null;
  const native=readNative(this.surface,this.#model,this.#general?"general-v1":"original"),selection=native??this.#model.view.selection;
  if(selection?.kind!=="text"||target&&!isCurrentCaretTarget(selection,target))return null;
  const willSync=!this.#busy&&owned&&native!==null&&!sameSelection(native,this.#model.view.selection);
  return captureMarkdownInputSource(this.#model.view.revision,selection,willSync);
 }
 #typeMarkdown(source:MarkdownInputSource,text:string):void {
  this.#live();if((this.#searchEvents.notifying||this.#writingEvents.notifying))throw Error("Read notifications cannot publish reentrantly");
  const view=this.#options.core.view();checkMarkdownInputSource(view,source);
  if(this.#queue.length>=128)throw Error("Rich editor command queue is full");
  const inputRule=Object.freeze({text,namespace:this.#allocate("rule"),...(view.historyGrouping==="typing-v1"?{clockMs:this.#clock()}:{} ),...(needsInputRuleSets(this.#inputRuleIds)?{rules:this.#inputRuleIds!,...(this.#typography?{typography:this.#typography}:{})}:{})});
  this.#queue.push({inputRule,revision:source.revision,focus:true});this.#drain();
 }
 /** `autolink-v1` Enter: only a plain caret split takes the exclusive native split-and-link call. */
 #autolinkParagraph(command:RichCommand,target:Extract<RichSelection,{kind:"text"}>|null):boolean {
  if(!this.#inputRuleIds?.includes("autolink-v1")||command.kind!=="insertParagraph"||this.#logicalSelection)return false;
  const selection=this.#model.view.selection;
  if(selection?.kind!=="text"||selection.anchor.block!==selection.focus.block||selection.anchor.offset!==selection.focus.offset||target&&!isCurrentCaretTarget(selection,target))return false;
  this.#live();if((this.#searchEvents.notifying||this.#writingEvents.notifying))throw Error("Read notifications cannot publish reentrantly");
  if(this.#queue.length>=128)throw Error("Rich editor command queue is full");
  this.#queue.push({paragraph:{right:command.data.right,newItem:command.data.newItem},revision:this.#model.view.revision,focus:true});this.#drain();
  return true;
 }
 /**
  * `markdown-v1` code Enter: a collapsed code caret retains one line feed through the exclusive
  * native call, which alone decides the conventional exit. Shift+Enter and ranges stay ordinary.
  */
 #codeEnter(command:RichCommand,target:Extract<RichSelection,{kind:"text"}>|null):boolean {
  if(!this.#inputRuleIds?.includes("markdown-v1")||command.kind!=="insertHardBreak"||this.#logicalSelection)return false;
  const selection=this.#model.view.selection;
  if(selection?.kind!=="text"||selection.anchor.block!==selection.focus.block||selection.anchor.offset!==selection.focus.offset||this.#model.nodes.get(selection.focus.block)?.type!=="breditor/code-block"||target&&!isCurrentCaretTarget(selection,target))return false;
  this.#live();if((this.#searchEvents.notifying||this.#writingEvents.notifying))throw Error("Read notifications cannot publish reentrantly");
  if(this.#queue.length>=128)throw Error("Rich editor command queue is full");
  const inputRule=Object.freeze({text:"\n",namespace:this.#allocate("rule"),...(needsInputRuleSets(this.#inputRuleIds)?{rules:this.#inputRuleIds!,...(this.#typography?{typography:this.#typography}:{})}:{})});
  this.#queue.push({inputRule,revision:this.#model.view.revision,focus:true});this.#drain();
  return true;
 }
 #inputRuleRefused():void {
  if(this.#disposed)return;this.status.textContent=this.#ui.text("inputRuleRefused");
  try{this.#options.onInputRuleRefused?.();}catch(error){this.#report(error);}
 }
 /** Commands prepared by asynchronous hosts should pass their observed revision. */
 execute(command:RichCommand,focus=true,expectedRevision=this.#model.view.revision):RichCommandOutcome|"queued" {
  if(isDocumentIntent(command))throw Error("Use the named document-selection DOM methods, not the original execute protocol");
  return this.#executeIntent(command,focus,expectedRevision);
 }
 /** Explicit extended scope entry point; original execute remains closed. */
 selectDocument(this:RichDomEditor<"document-v1">,expectedRevision=this.#model.view.revision):RichCommandOutcome|"queued" {
  return this.#executeIntent({kind:"selectDocument"},true,expectedRevision);
 }
 pasteDocumentClipboard(this:RichDomEditor<"document-v1">,clipboardJson:string,expectedRevision=this.#model.view.revision):RichCommandOutcome|"queued" {
  return this.#executeIntent({kind:"pasteDocumentClipboard",clipboardJson,prefix:this.#allocate("paste")},true,expectedRevision);
 }
 replaceDocumentPlainText(this:RichDomEditor<"document-v1">,text:string,expectedRevision=this.#model.view.revision):RichCommandOutcome|"queued" {
  return this.#executeIntent({kind:"replaceDocumentPlainText",paragraph:this.#allocate("p"),text},true,expectedRevision);
 }
 collapseDocumentSelection(this:RichDomEditor<"document-v1">,side:"before"|"after",expectedRevision=this.#model.view.revision):RichCommandOutcome|"queued" {
  return this.#executeIntent({kind:"collapseDocumentSelection",side},true,expectedRevision);
 }
 /** Opt-in HTML source port: the explicit interchange adapter plus one guarded whole-document rich paste. */
 documentSource(this:RichDomEditor<"document-v1">):RichDocumentSourceHost{this.#live();return createDocumentSourceHost({surface:this.surface,core:this.#document!,interchange:this.#interchange,state:()=>this.contextUiState(),subscribe:listener=>this.subscribeContextUi(listener),selectDocument:revision=>this.selectDocument(revision),paste:(clipboardJson,revision)=>this.pasteDocumentClipboard(clipboardJson,revision)});}
 #executeIntent(command:RichCommand|DocumentIntent,focus=true,expectedRevision=this.#model.view.revision,accepted?:((display:boolean)=>void)):RichCommandOutcome|"queued" {
  this.#live();
  if((this.#searchEvents.notifying||this.#writingEvents.notifying))throw Error("Read notifications cannot publish reentrantly");
  if(this.#queue.length>=128)throw Error("Rich editor command queue is full");
  // Validate layout before the queue's detached JSON snapshot can turn nonfinite values into Clear.
  const intent=command.kind==="changeSelectionLayout"?{...command,data:JSON.parse(encodeBlockLayoutPatch(command.data))}:command.kind==="setListNumbering"?{...command,data:encodeListNumberingPatch(command.data)}:command;
  this.#queue.push({command:JSON.parse(JSON.stringify(intent)) as RichCommand|DocumentIntent,revision:expectedRevision,focus,accepted});
  return this.#drain();
 }
 #drain():RichCommandOutcome|"queued" {
  if(this.#busy||this.#composition)return "queued";
  this.#busy=true;let first:RichCommandOutcome|undefined,drained=0;
  try {while(this.#queue.length){
   if(++drained>128){const error=Error("Rich editor callback command loop exceeded its bound");this.#cancelQueue(error);throw error;}
   const work=this.#queue.shift()!;
   let published=false,display=true,inputRuleOutcome:RichInputRuleOutcome|undefined;
   try {
    const active=this.surface.ownerDocument.activeElement,ownedFocus=active===this.surface||!!active&&this.surface.contains(active);
    let outcome:RichCommandOutcome;
    if(work.inputRule){inputRuleOutcome=publishMarkdownInput(this.#options.core,work.inputRule,work.revision);outcome=inputRuleOutcome==="unchanged"?"unchanged":"content";}
    else if(work.paragraph){inputRuleOutcome=this.#options.core.insertParagraphWithAutolink!(work.paragraph,work.revision);outcome=inputRuleOutcome==="unchanged"?"unchanged":"content";}
    else if(work.region)outcome=this.#options.core.navigateRestrictedRegion!(work.region==="next",work.revision);
    else if(work.search)outcome=publishRichSearchIntent(this.#options.core,work.search,work.revision);
    else if(isDocumentIntent(work.command)){if(!this.#document)throw Error("Use the explicit document-selection DOM owner");outcome=publishDocumentIntent(this.#document,work.command,work.revision);}else outcome=this.#options.core.execute(work.command,work.revision);
    published=true;first??=outcome;this.#model=this.#read();this.#logicalSelection=this.#logical();
    if(outcome==="content"||outcome==="undo"||outcome==="redo")render(this.surface,this.#model,this.#renderOptions());else paintSelection(this.surface,this.#model);
    // An asynchronous focus:false edit must retain an already-owned caret after
    // replacing children, but must not steal focus from an outside host control.
    if(work.focus||ownedFocus){this.surface.focus({preventScroll:true});restoreDocumentNative(this.surface,this.#model.view.selection);}
    this.#refreshControls();this.status.textContent=this.#ui.text(this.#model.view.readOnly===true?"richStatusReadOnlyOutcome":"richStatusOutcome",{outcome,revision:this.#model.view.revision});
    if(outcome!=="unchanged")this.#options.onChange?.(this.#options.core.view(),outcome);
   }catch(error){display=false;if(!published)work.completion?.reject(error);if(first===undefined)throw error;this.#report(error);}
   finally{if(published){work.completion?.resolve();work.accepted?.(display);if(inputRuleOutcome==="refused")this.#inputRuleRefused();}}
  }}finally{this.#busy=false;this.#notifySearch();}
  return first??"unchanged";
 }
 #notifySearch():void{this.#searchEvents.emit(error=>this.#report(error));this.#writingEvents.emit(error=>this.#report(error));}
 #refreshPlaceholder():void {if(!this.#placeholder)return;this.#placeholder.update(false);if(this.#disposed||this.#busy||this.#composition||this.#model.view.readOnly===true)return;try{this.#placeholder.update(this.#options.core.placeholderEmpty!(this.#model.view.revision));}catch(error){this.#report(error);}}
 /** Live UI label only. The native prompt mode must have been admitted at startup. */
 setPlaceholderLabel(label:string|null):void{this.#live();if(!this.#placeholder)throw Error("Admit a native placeholder at startup before changing its label");this.#placeholder.setLabel(label);}
 supportsRetainedAssetReferences():boolean{this.#live();return this.#options.core.supportsRetainedAssetReferences?.()===true&&typeof this.#options.core.retainedAssetReferences==="function"&&typeof this.#options.core.checkRetainedAssetReferences==="function";}
 retainedAssetReferences(revision=this.#model.view.revision):import("./retained_asset_references_types.js").RichRetainedAssetReferencesRead{this.#live();if(this.#busy||this.#composition)throw Error("Asset reference reads wait for the current operation or composition");if(!this.supportsRetainedAssetReferences())throw Error("Use complete matching native retained asset reads");return this.#options.core.retainedAssetReferences!(revision);}
 checkRetainedAssetReferences(read:import("./retained_asset_references_types.js").RichRetainedAssetReferencesRead,revision=this.#model.view.revision):void{this.#live();if(this.#busy||this.#composition)throw Error("Asset reference checks wait for the current operation or composition");if(!this.supportsRetainedAssetReferences())throw Error("Use complete matching native retained asset reads");this.#options.core.checkRetainedAssetReferences!(read,revision);}
 writingState():RichWritingToolsHostState{const view=this.#model.view,closed=this.#disposed,core=this.#options.core;return Object.freeze({revision:view.revision,closed,busy:this.#busy,composing:!!this.#composition,available:!closed&&core.supportsWritingTools?.()===true&&typeof core.writingTools==="function",readOnly:view.readOnly===true});}
 subscribeWriting(listener:()=>void):()=>void{this.#live();return this.#writingEvents.subscribe(listener);}
 get fullscreenRoot():HTMLElement{return this.#root;}
 fullscreenState():import("./fullscreen_types.js").RichFullscreenHostState{return Object.freeze({revision:this.#model.view.revision,closed:this.#disposed,busy:this.#busy,composing:!!this.#composition});}
 subscribeFullscreen(listener:()=>void):()=>void{this.#live();return this.#writingEvents.subscribe(listener);}
 focusFullscreen(revision:string):void{this.#live();const state=this.fullscreenState();if(state.busy||state.composing||state.revision!==revision||this.#searchEvents.notifying||this.#writingEvents.notifying)throw Error("Fullscreen focus requires the exact idle publication outside composition or notifications");this.surface.focus({preventScroll:true});restoreDocumentNative(this.surface,this.#model.view.selection);}
 readWritingTools(revision=this.#model.view.revision):RichWritingToolsRead{this.#live();const state=this.writingState();if(state.busy||state.composing)throw Error("Writing reads wait for the current operation or composition");if(!state.available)throw Error("Use complete matching native writing reads");return this.#writingReads.retain(this.#options.core.writingTools!(revision),revision);}
 selectWritingHeading(read:RichWritingToolsRead,index:number,revision=read.revision):Promise<void>{return new Promise((resolve,reject)=>{try{this.#live();const state=this.writingState();if(state.busy||state.composing||this.#searchEvents.notifying||this.#writingEvents.notifying)throw Error("Writing navigation waits for the current operation, composition or read notification");const entry=this.#writingReads.heading(read,index,revision),point={block:entry.block,offset:"0",affinity:"after" as const};if(this.#queue.length>=128)throw Error("Rich editor command queue is full");this.#queue.push({command:{kind:"setSelection",selection:{kind:"text",anchor:point,focus:point}},revision,focus:true,completion:{resolve,reject}});this.#drain();}catch(error){reject(error);}});}
 #cancelQueue(error:unknown):void{const pending=this.#queue;this.#queue=[];for(const work of pending)work.completion?.reject(error);}
 #repeatWork(work:Work):void{if(this.#disposed){work.completion?.reject(Error("The rich DOM editor is disposed"));return;}if(this.#queue.length>=128){work.completion?.reject(Error("Rich editor command queue is full"));throw Error("Rich editor command queue is full");}this.#queue.push(work);this.#drain();}
 #searchAction(search:RichSearchIntent,revision:string):Promise<void>{return new Promise((resolve,reject)=>{try{this.#live();if((this.#searchEvents.notifying||this.#writingEvents.notifying))throw Error("Read notifications cannot publish reentrantly");if(this.#queue.length>=128)throw Error("Rich editor command queue is full");this.#queue.push({search,revision,focus:false,completion:{resolve,reject}});this.#drain();}catch(error){reject(error);}});}
 searchState():RichSearchHostState{const view=this.#model.view,closed=this.#disposed,available=!closed&&this.#options.core.supportsSearch?.()===true;return Object.freeze({revision:view.revision,closed,busy:this.#busy,composing:!!this.#composition,available,readOnly:view.readOnly===true,canReplace:available&&view.readOnly!==true});}
 subscribeSearch(listener:()=>void):()=>void{this.#live();return this.#searchEvents.subscribe(listener);}
 findText(query:RichSearchQuery,revision=this.#model.view.revision):RichSearchResults{this.#live();const core=this.#options.core;if(core.supportsSearch?.()!==true||!core.findText)throw Error("Use matching native search");return core.findText(query,revision);}
 checkSearchResults(results:RichSearchResults,revision=this.#model.view.revision):void{this.#live();const core=this.#options.core;if(!core.checkSearchResults)throw Error("Use matching native search");core.checkSearchResults(results,revision);}
 selectSearchMatch(results:RichSearchResults,index:string,revision=this.#model.view.revision):Promise<void>{return this.#searchAction({kind:"select",results,index},revision);}
 replaceSearchOne(results:RichSearchResults,index:string,replacement:RichSearchReplacement,revision=this.#model.view.revision):Promise<void>{const frozen=JSON.parse(JSON.stringify(replacement)) as RichSearchReplacement;return this.#searchAction({kind:"replaceOne",results,index,replacement:frozen},revision);}
 replaceSearchAll(results:RichSearchResults,replacement:RichSearchReplacement,revision=this.#model.view.revision):Promise<void>{const frozen=JSON.parse(JSON.stringify(replacement)) as RichSearchReplacement;return this.#searchAction({kind:"replaceAll",results,replacement:frozen},revision);}
 view():RichEditorView<P> {this.#live();return this.#options.core.view();}
 /** Whether the native owner runs `replaceTriggerThen` (a slash command as one Undo step). */
 supportsTriggerComposite():boolean{this.#live();return this.#options.core.supportsTriggerComposite?.()===true;}
 checkpointJson():string {this.#live();return this.#options.core.checkpointJson();}
 /** Close native continuation without rendering, moving focus, or inventing a content outcome. */
 closeTypingGroup(revision=this.#options.core.view().revision):boolean {
  this.#live();if(this.#busy||this.#composition||(this.#searchEvents.notifying||this.#writingEvents.notifying))throw Error("History boundaries cannot publish during a command, composition or read notification");
  const core=this.#options.core;
  if(core.supportsTypingHistory?.()!==true||!core.closeTypingGroup){if(this.#model.view.historyGrouping==="typing-v1")throw Error("Use matching native typing history");return false;}
  const changed=core.closeTypingGroup(revision);if(changed){this.#model=this.#read();this.#refreshControls();this.#notifySearch();}return changed;
 }
 #boundary():void {if(this.#model.view.historyGrouping==="typing-v1"&&!this.#busy&&!this.#composition)this.#attempt(()=>{this.closeTypingGroup();});}
 #clock():string {const clock=Math.floor(this.surface.ownerDocument.defaultView!.performance.now());if(!Number.isSafeInteger(clock)||clock<0)throw Error("Expected a finite monotonic typing clock");return String(clock);}
 #deleteInput(selection:Extract<RichSelection,{kind:"text"}>,backward:boolean,inputType:string):void {
  const current=this.#model.view.selection;
  const natural=this.#model.view.historyGrouping==="typing-v1"&&/^delete(?:Content|Word|SoftLine|HardLine)(?:Backward|Forward)$/.test(inputType)&&current?.kind==="text"&&current.anchor.block===current.focus.block&&current.anchor.offset===current.focus.offset;
  if(natural&&selection.anchor.block===current.focus.block&&selection.focus.block===current.focus.block){
   const a=BigInt(selection.anchor.offset),b=BigInt(selection.focus.offset),start=a<b?a:b,end=a>b?a:b,at=BigInt(current.focus.offset);
   if(start<end&&(backward?end===at:start===at)){this.execute({kind:"deleteTypingRange",data:{selection,direction:backward?"backward":"forward",clockMs:this.#clock()}});return;}
  }
  this.execute(this.#general?{kind:"replaceGeneralRangePlainText",data:{selection,text:"",prefix:this.#allocate("range")}}:{kind:"replaceTextRange",data:{selection,text:""}});
 }
 /** Move the selection to the next/previous editable region of the live restricted-editing policy. */
 navigateRestrictedRegion(direction:"next"|"previous",expectedRevision=this.#model.view.revision):RichCommandOutcome|"queued" {
  this.#live();if(this.#options.core.supportsRestrictedEditing?.()!==true)throw Error("Use a matching native owner with restricted editing");
  return this.#navigateRegion(direction,expectedRevision);
 }
 #navigateRegion(direction:"next"|"previous",expectedRevision=this.#model.view.revision):RichCommandOutcome|"queued" {
  if((this.#searchEvents.notifying||this.#writingEvents.notifying))throw Error("Read notifications cannot publish reentrantly");
  if(this.#queue.length>=128)throw Error("Rich editor command queue is full");
  this.#queue.push({region:direction,revision:expectedRevision,focus:true});return this.#drain();
 }
 /** Install, replace or clear (`null`) the live restricted-editing policy; queued edits are cancelled. */
 setRestrictedEditing(policy:RichRestrictedPolicy|null,revision=this.#options.core.view().revision):boolean {
  this.#live();if(this.#busy||(this.#searchEvents.notifying||this.#writingEvents.notifying))throw Error("Editing policy cannot publish reentrantly");
  const core=this.#options.core;if(!core.setRestrictedEditing||core.supportsRestrictedEditing?.()!==true)throw Error("Use a matching native owner with restricted editing");
  const changed=core.setRestrictedEditing(policy,revision);if(changed){this.#composition=undefined;this.#cancelQueue(Error("Editing policy cancelled queued search work"));this.#reconcile();this.#notifySearch();}return changed;
 }
 /** Change native host policy immediately, cancelling provisional composition and queued edits. */
 setReadOnly(value:boolean,revision=this.#options.core.view().revision):boolean {
  this.#live();if(this.#busy||(this.#searchEvents.notifying||this.#writingEvents.notifying))throw Error("Editing policy cannot publish reentrantly");
  const core=this.#options.core;if(!core.setReadOnly||core.supportsReadOnly?.()!==true)throw Error("Use a matching native owner with read-only enforcement");
  const changed=core.setReadOnly(value,revision);if(changed){this.#composition=undefined;this.#cancelQueue(Error("Editing policy cancelled queued search work"));this.#reconcile();this.status.textContent=this.#ui.text(value?"richStatusReadOnly":"richStatusEditable",{revision:this.#model.view.revision});this.#notifySearch();}return changed;
 }
 focus():void {this.#live();this.surface.focus();restoreDocumentNative(this.surface,this.#model.view.selection);}
 #pick(event:PointerEvent):void {
  this.#boundary();
  const target=event.target as Element,button=target.closest<HTMLElement>("[data-select-cell]"),figure=target.closest<HTMLElement>("[data-rich-image]"),node=target.closest<HTMLElement>("[data-select-node]");
  if(button){event.preventDefault();const cell=JSON.parse(button.dataset["selectCell"]!) as Extract<RichSelection,{kind:"grid"}>["focus"],prior=this.#model.view.selection;const anchor=event.shiftKey&&prior?.kind==="grid"&&prior.anchor.table===cell.table?prior.anchor:cell;this.#attempt(()=>this.execute({kind:"setSelection",selection:{kind:"grid",anchor,focus:cell}}));}
  else if(node||(figure&&!target.closest("[data-rich-text]"))){event.preventDefault();const block=node?.dataset["selectNode"]??figure?.dataset["richBlock"];if(block)this.#attempt(()=>this.execute({kind:"setSelection",selection:{kind:"node",block}}));}
  else this.#logicalSelection=false;
 }
 #inertSummary(event:Event):void {
  const target=event.target;
  if(this.#model.view.readOnly!==true&&target instanceof Element&&target.closest("details[data-rich-details]>summary[data-rich-text]"))event.preventDefault();
 }
 #restoreDetails(event:Event):void {
  const details=event.target;
  if(this.#model.view.readOnly===true||!(details instanceof HTMLDetailsElement)||details.dataset["richDetails"]===undefined)return;
  const open=this.#model.nodes.get(details.dataset["richDetails"])?.properties["breditor/details-open"]===true;
  if(details.open!==open)details.open=open;
 }
 /** V4 owners render bookmarks and internal links; other owners keep their exact output. */
 #renderOptions():RichEditorOptions<P>{return this.#bookmarks?{...this.#options,bookmarks:true}:this.#options;}
 /** V4 internal links never navigate the host page: while editing they are inert, and in a
  * read-only surface activation scrolls this surface's bookmarked block into view (two editors on
  * one page never jump into each other). A dangling link does nothing. */
 #internalLink(event:Event):void {
  const target=event.target,link=target instanceof Element?target.closest<HTMLElement>("a[data-rich-internal-link]"):null;
  if(!link||!this.surface.contains(link))return;
  event.preventDefault();
  if(this.#model.view.readOnly!==true||event.type!=="click")return;
  const name=link.dataset["richInternalLink"]??"";
  for(const block of this.surface.querySelectorAll<HTMLElement>("[data-rich-bookmark]"))if(block.dataset["richBookmark"]===name){block.scrollIntoView({block:"start"});return;}
 }
 #inertImageLink(event:Event):void {
  const target=event.target;
  if(this.#model.view.readOnly!==true&&target instanceof Element&&target.closest("a[data-rich-image-link]"))event.preventDefault();
 }
 #taskCheck(event:MouseEvent):void {
  const target=event.target as Element,check=target.closest<HTMLInputElement>("input[data-task-check]");if(!check||!this.surface.contains(check))return;
  event.preventDefault();if(this.#composition||this.#model.view.readOnly===true)return;
  const item=check.dataset["taskCheck"],node=item?this.#model.nodes.get(item):undefined;if(!node||node.type!=="breditor/task-item")return;
  this.#attempt(()=>{this.execute({kind:"setTaskChecked",data:{item:id(node),checked:node.properties["breditor/checked"]!==true}});[...this.surface.querySelectorAll<HTMLInputElement>("input[data-task-check]")].find(input=>input.dataset["taskCheck"]===item)?.focus({preventScroll:true});});
 }
 /** Bare/custom V2 toolbars retain native formatting without a JS interval fallback. */
 #selectionFormat(action:string|undefined):boolean {
  const {core,inlinePresentation}=this.#options;
  if(!action||!isStructuralRichLanguage(core.richLanguageVersion?.())||core.supportsSelectionFormatting?.()!==true||!inlinePresentation)return false;
  const control=standardSelectionInlineControls(core,inlinePresentation).find(c=>c.id===action);
  if(!control||control.fields)return false;
  if(control.read().kind!=="unavailable"){const changes=selectionFormatChanges(control.changes({}));if(changes.length)this.execute({kind:"changeSelectionFormats",data:{changes}});}
  return true;
 }
 #key(event:KeyboardEvent):void {
  if(this.#composition||event.isComposing)return;
  const mod=event.metaKey||event.ctrlKey;
  if(mod&&!["Backspace","Delete"].includes(event.key)||["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown","Tab","Enter","Escape"].includes(event.key))this.#boundary();
  // A focused native widget owns navigation/deletion even if the logical editor
  // selection is still a table grid or node. Keep editor Undo/Redo available so
  // a checkbox activation remains an ordinary undoable document action.
  const widget=(event.target as Element).closest("input,button,select,textarea");
  if(widget&&!(mod&&!event.altKey&&["z","y"].includes(event.key.toLowerCase()))){
   // A checkbox/button cannot delete text. Do not let an unhandled Backspace
   // turn into browser-history navigation (observed in WebKit), nor a grid edit.
   if(["Backspace","Delete"].includes(event.key)&&widget.matches("button,input[type=checkbox],input[type=radio]"))event.preventDefault();
   return;
  }
  if(this.#model.view.readOnly===true&&(["Backspace","Delete","Enter"].includes(event.key)||!mod&&!event.altKey&&[...event.key].length===1||mod&&!event.altKey&&["z","y","b","i","u","k"].includes(event.key.toLowerCase()))){event.preventDefault();return;}
  if(this.#model.view.selection?.kind==="document"&&this.#document){
   const side=({ArrowLeft:"before",ArrowUp:"before",Home:"before",PageUp:"before",ArrowRight:"after",ArrowDown:"after",End:"after",PageDown:"after",Escape:"before"} as const)[event.key as "ArrowLeft"];
   if(side&&!event.altKey&&!event.shiftKey){event.preventDefault();this.#attempt(()=>this.#executeIntent({kind:"collapseDocumentSelection",side}));return;}
   if(!mod&&!event.altKey&&["Backspace","Delete","Enter"].includes(event.key)){
    event.preventDefault();this.#attempt(()=>this.#executeIntent({kind:"replaceDocumentPlainText",paragraph:this.#allocate("p"),text:event.key==="Enter"&&event.shiftKey?"\n":""}));return;
   }
   if(!mod&&!event.altKey&&[...event.key].length===1){event.preventDefault();this.#attempt(()=>this.#replaceDocumentInput(event.key,true));return;}
   if(side&&event.shiftKey)this.#logicalSelection=false;
  }
  // V4 table captions: <caption> is first in the DOM but laid out after the rows, so the
  // editor owns the arrow keys at the four caption boundaries (see table_caption_navigation.ts).
  if(!mod&&!event.altKey&&!event.shiftKey&&["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key)&&this.#options.core.supportsTableCaptions?.()===true){
   this.#attempt(()=>{this.#sync();const commands=captionArrowCommands(this.surface,this.#model,event.key as "ArrowUp");if(commands){event.preventDefault();for(const command of commands)this.execute(command);}});
   if(event.defaultPrevented)return;
  }
  const alignment=blockLayoutShortcut(event);
  if(alignment&&this.#options.core.supportsBlockLayout?.()===true){
   event.preventDefault();if(this.#model.view.readOnly===true)return;
   this.#attempt(()=>{this.#sync();const state=this.#options.core.blockLayoutState?.();if(state&&state.blocks!=="0")this.execute({kind:"changeSelectionLayout",data:{alignment}});});return;
  }
  // Logical node selections deliberately have no DOM range. Firefox/WebKit
  // (and Chromium images) may therefore emit no beforeinput for a printable key.
  // Own this first key only; cancelling its default prevents duplicate insertion.
  if(!mod&&!event.altKey&&[...event.key].length===1&&isStructuralRichLanguage(this.#options.core.richLanguageVersion?.())&&this.#options.core.supportsAtomEditing?.()===true&&selectedFlowAtom(this.#model)){
   event.preventDefault();this.#attempt(()=>{this.#sync();const paragraph=this.#allocate("p");this.execute(this.#model.view.historyGrouping==="typing-v1"?{kind:"replaceAtomTypingText",data:{paragraph,text:event.key,clockMs:this.#clock()}}:{kind:"replaceAtomPlainText",data:{paragraph,text:event.key}});});return;
  }
  if(isStructuralRichLanguage(this.#options.core.richLanguageVersion?.())&&this.#options.core.supportsFlowNavigation?.()===true){
   if(event.altKey&&!mod&&!event.shiftKey&&(event.key==="PageUp"||event.key==="PageDown")){
    // This reserved logical shortcut owns the default even at a boundary/range:
    // otherwise native PageDown can collapse/move a range after Rust refuses it.
    event.preventDefault();this.#attempt(()=>{this.#sync();const movement=event.key==="PageUp"?"before":"after";if(flowEdgeEligible(this.#model,movement))this.execute({kind:"navigateFlow",data:{movement}});});return;
   }
   if(event.key==="Enter"&&!mod&&!event.altKey){this.#attempt(()=>{this.#sync();if(selectedFlowAtom(this.#model)){event.preventDefault();this.execute({kind:"insertParagraphAdjacent",data:{paragraph:this.#context().allocate("p"),side:event.shiftKey?"before":"after"}});}});if(event.defaultPrevented)return;}
  }
  // Native code exit also works with an empty/custom toolbar. A range is not
  // replaced, and focused native widgets/composition retain their own keys.
  if(mod&&event.key==="Enter"&&!event.shiftKey&&!event.altKey&&isStructuralRichLanguage(this.#options.core.richLanguageVersion?.())){
   event.preventDefault();this.#attempt(()=>{this.#sync();const s=this.#model.view.selection;
    if(s?.kind!=="text"||s.anchor.block!==s.focus.block||s.anchor.offset!==s.focus.offset||this.#model.nodes.get(s.focus.block)?.type!=="breditor/code-block")return;
    if(this.#options.core.supportsCodeExit?.()!==true)throw Error("Use a matching native code-exit owner");
    this.execute({kind:"exitCodeBlock",data:{paragraph:this.#context().allocate("p")}});
   });return;
  }
  if(mod&&!event.altKey&&event.key.toLowerCase()==="a"){
   if(this.#document){event.preventDefault();this.#attempt(()=>this.#executeIntent({kind:"selectDocument"}));return;}
   this.#logicalSelection=false;
  }
  if(mod&&!event.altKey){const key=`${event.shiftKey?"shift+":""}${event.key.toLowerCase()}`,control=this.#controls.find(item=>item.control.shortcut===key);if(control){event.preventDefault();this.#attempt(()=>{this.#sync();control.view.activate();});return;}}
  const nativeShortcut=({b:"bold",i:"italic",u:"underline","shift+x":"strike"} as Record<string,string>)[`${event.shiftKey?"shift+":""}${event.key.toLowerCase()}`];
  if(mod&&!event.altKey&&nativeShortcut&&isStructuralRichLanguage(this.#options.core.richLanguageVersion?.())&&this.#options.core.supportsSelectionFormatting?.()===true&&this.#options.inlinePresentation){event.preventDefault();this.#attempt(()=>{this.#sync();this.#selectionFormat(nativeShortcut);});return;}
  if(mod&&!event.altKey&&["z","y","b"].includes(event.key.toLowerCase())){event.preventDefault();this.#attempt(()=>{this.#sync();const key=event.key.toLowerCase(),command=key==="b"?bold(this.#context()):{kind:key==="y"||event.shiftKey?"redo":"undo"} as RichCommand;if(command)this.execute(command);});return;}
  // Own the keyboard meaning before a browser can translate Shift+Enter into
  // insertParagraph (observed in WebKit). Composition and grid navigation stay separate.
  if(event.key==="Enter"&&event.shiftKey&&!mod&&!event.altKey){
   this.#attempt(()=>{this.#sync();const selection=this.#model.view.selection;if(selection?.kind==="text"){event.preventDefault();this.execute(this.#general?{kind:"replaceGeneralRangePlainText",data:{selection,text:"\n",prefix:this.#allocate("range")}}:{kind:"insertHardBreak"});}});
   if(event.defaultPrevented)return;
  }
  const selection=this.#model.view.selection;
  // Restricted mode: Tab/Shift+Tab move between editable regions; at either end focus may leave.
  if(this.#model.view.restricted&&this.#model.view.readOnly!==true&&event.key==="Tab"&&!mod&&!event.altKey){
   this.#attempt(()=>{this.#sync();if(this.#navigateRegion(event.shiftKey?"previous":"next")!=="unchanged")event.preventDefault();});
   return;
  }
  if(this.#model.view.readOnly!==true&&event.key==="Tab"&&!mod&&!event.altKey){
   this.#attempt(()=>{this.#sync();const command=taskTab(this.#context(),event.shiftKey);if(command){event.preventDefault();this.execute(command);}});
   if(event.defaultPrevented)return;
  }
  if(selection?.kind==="grid"){
   const moves:Record<string,string>={ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down",Tab:event.shiftKey?"previous":"next",Home:mod?"tableStart":"rowStart",End:mod?"tableEnd":"rowEnd"};
   const movement=moves[event.key];
   if(movement){const outcome=this.execute({kind:"navigateGrid",data:{movement:movement as "next",extend:event.key!=="Tab"&&event.shiftKey}});if(outcome!=="unchanged"||event.key!=="Tab")event.preventDefault();return;}
   if(event.key==="Enter"||event.key==="Escape"){event.preventDefault();const cell=selection.focus,node=this.#model.textBlocks.find(node=>{const source=sourceCell(this.#model,id(node));return source?.table===cell.table&&source.row===cell.row&&source.column===cell.column;});if(node)this.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:id(node),offset:"0",affinity:"after"},focus:{block:id(node),offset:"0",affinity:"after"}}});return;}
  }
  if((selection?.kind==="grid"||selection?.kind==="node")&&(event.key==="Backspace"||event.key==="Delete")){event.preventDefault();this.#attempt(()=>{const command=deleteSelection(this.#context(),event.key==="Backspace"?"before":"after");if(command)this.execute(command);});}
 }
 #input(event:InputEvent):void {
  if(this.#model.view.readOnly===true){event.preventDefault();return;}
  if(this.#composition||event.isComposing)return;
  event.preventDefault();this.#attempt(()=>{
   const markdown=this.#captureMarkdownInput(event);this.#sync();
   if(markdown){this.#typeMarkdown(markdown,event.data!);return;}
   const type=event.inputType;
   if(type!=="insertText"&&!type.startsWith("delete"))this.#boundary();
   const action=({formatBold:"bold",formatItalic:"italic",formatUnderline:"underline",formatStrikeThrough:"strike",formatSubscript:"subscript",formatSuperscript:"superscript"} as Record<string,string>)[type],control=this.#controls.find(item=>item.control.id===action);if(control){control.view.activate();return;}
   if(this.#selectionFormat(action))return;
   if(type==="historyUndo"||type==="historyRedo"){this.execute({kind:type==="historyUndo"?"undo":"redo"});return;}
   if(type==="formatBold"){const command=bold(this.#context());if(command)this.execute(command);return;}
   if(this.#model.view.selection?.kind==="document"&&this.#document){
    if(type.startsWith("delete")){this.#replaceDocumentInput("",false);return;}
    if(type==="insertParagraph"||type==="insertLineBreak"){this.#replaceDocumentInput(type==="insertLineBreak"?"\n":"",false);return;}
    if((type==="insertText"||type==="insertReplacementText")&&event.data)this.#replaceDocumentInput(event.data,type==="insertText");
    return;
   }
   if((type==="insertParagraph"||type==="insertLineBreak")&&isStructuralRichLanguage(this.#options.core.richLanguageVersion?.())&&this.#options.core.supportsFlowNavigation?.()===true&&selectedFlowAtom(this.#model)){this.execute({kind:"insertParagraphAdjacent",data:{paragraph:this.#context().allocate("p"),side:type==="insertLineBreak"?"before":"after"}});return;}
   if(type==="insertParagraph"){const range=event.getTargetRanges?.()[0],target=this.#general&&range?readTarget(this.surface,range):null;const command=enter(this.#context(),this.#general,target&&target.anchor.block!==target.focus.block?target:undefined);if(command&&!this.#autolinkParagraph(command,target)&&!this.#codeEnter(command,target))this.execute(command);return;}
   const selection=this.#model.view.selection;
   if(isStructuralRichLanguage(this.#options.core.richLanguageVersion?.())&&this.#options.core.supportsAtomEditing?.()===true&&selectedFlowAtom(this.#model)){
    if(type.startsWith("delete")){this.execute({kind:"deleteAtom",data:{paragraph:this.#allocate("p"),movement:type.includes("Backward")?"before":"after"}});return;}
    if(type==="insertText"||type==="insertReplacementText"){const input=event.data??"";if(input)this.execute(type==="insertText"&&this.#model.view.historyGrouping==="typing-v1"?{kind:"replaceAtomTypingText",data:{paragraph:this.#allocate("p"),text:input,clockMs:this.#clock()}}:{kind:"replaceAtomPlainText",data:{paragraph:this.#allocate("p"),text:input}});return;}
   }
   if(selection?.kind!=="text")return;
   const ranges=event.getTargetRanges?.()??[],target=ranges[0]?readTarget(this.surface,ranges[0]):null;
   if(this.#general&&(type==="insertText"||type==="insertReplacementText"||type==="insertLineBreak")){
    const text=type==="insertLineBreak"?"\n":event.data??"",data={selection:target&&!isCurrentCaretTarget(selection,target)?target:selection,text,prefix:this.#allocate("range")};
    this.execute(type==="insertText"&&this.#model.view.historyGrouping==="typing-v1"?{kind:"replaceGeneralRangeTypingText",data:{...data,clockMs:this.#clock()}}:{kind:"replaceGeneralRangePlainText",data});return;
   }
   if(type==="insertLineBreak"){this.execute(target&&!isCurrentCaretTarget(selection,target)?{kind:"replaceTextRange",data:{selection:target,text:"\n"}}:{kind:"insertHardBreak"});return;}
   if(type==="insertText"||type==="insertReplacementText"){
    const input=event.data??"",caret=selection.anchor.block===selection.focus.block&&selection.anchor.offset===selection.focus.offset;
    if(type==="insertText"&&caret&&this.#model.view.historyGrouping==="typing-v1"&&(!target||isCurrentCaretTarget(selection,target)))this.execute({kind:"insertTypingText",data:{text:input,clockMs:this.#clock()}});
    else this.execute(target&&!isCurrentCaretTarget(selection,target)?{kind:"replaceTextRange",data:{selection:target,text:input}}:{kind:"insertPlainText",text:input});return;
   }
   if(type.startsWith("delete")){
    const backward=type.includes("Backward"),boundary=boundaryDelete(this.#context(),backward);
    if(boundary){this.execute(boundary);return;}
    if(selection.anchor.block!==selection.focus.block||selection.anchor.offset!==selection.focus.offset){this.execute(this.#general?{kind:"replaceGeneralRangePlainText",data:{selection,text:"",prefix:this.#allocate("range")}}:{kind:"deleteSelection"});return;}
    if(target&&(target.anchor.block!==target.focus.block||target.anchor.offset!==target.focus.offset)){this.#deleteInput(target,backward,type);return;}
    const node=this.#model.nodes.get(selection.focus.block);if(!node)return;const content=text(node),offset=Number(selection.focus.offset),segments=[...new Intl.Segmenter(undefined,{granularity:type.includes("Word")?"word":"grapheme"}).segment(content)];
    const start=backward?(segments.filter(value=>value.index<offset).at(-1)?.index??0):offset,end=backward?offset:(segments.find(value=>value.index>=offset)?.index??content.length);
    const next=!backward&&end===offset?(segments.find(value=>value.index>offset)?.index??content.length):end;
    this.#deleteInput({kind:"text",anchor:{...selection.focus,offset:String(start)},focus:{...selection.focus,offset:String(backward?end:next)}},backward,type);
   }
  });
 }
 #copy(event:ClipboardEvent,cut:boolean):void {
  if(this.#composition||!event.clipboardData)return;
  if(this.#interchange&&this.#busy){event.preventDefault();return;}
  if(this.#general)event.preventDefault();
  this.#boundary();
  this.#attempt(()=>{this.#sync();const model=this.#model,revision=model.view.revision,whole=model.view.selection?.kind==="document",core=this.#options.core;if(this.#general&&(core.supportsGeneralCopy?.()!==true||typeof core.generalClipboard!=="function"))throw Error("Use matching native general clipboard copy");const transfer=whole?this.#document!.copyDocument():this.#general?core.generalClipboard!():core.clipboard();if(!transfer)return;
   event.preventDefault();const extra=exportClipboard(transfer.structuredJson,this.#interchange);
   writeClipboard(event.clipboardData!,transfer.plainText,transfer.structuredJson,extra,whole);
   if(cut&&model.view.readOnly!==true){const selection=model.view.selection,context={...this.#context(),model},command:RichCommand|DocumentIntent|null=whole?{kind:"replaceDocumentPlainText",paragraph:this.#allocate("p"),text:""}:this.#general&&selection?.kind==="text"?{kind:"replaceGeneralRangePlainText",data:{selection,text:"",prefix:this.#allocate("range")}}:deleteSelection(context);
    if(command){this.#executeIntent(command,true,revision,display=>this.#clipboardComplete("cut",revision,extra?.formats??[],undefined,display));return;}
   }
   this.#clipboardComplete("copy",revision,extra?.formats??[]);
  });
 }
 #paste(event:ClipboardEvent):void {
  if(this.#model.view.readOnly===true){event.preventDefault();return;}
  if(this.#composition||!event.clipboardData){if(this.#interchange)event.preventDefault();return;}event.preventDefault();
  this.#boundary();
  this.#attempt(()=>{const data=event.clipboardData!,foreign=this.#interchange&&data.types.some(t=>["application/x-breditor-rich+json","text/html","text/markdown"].includes(t)),files=[...data.files];if(files.length&&!foreign){this.#files(files);return;}
   this.#sync();const model=this.#model,revision=model.view.revision,selection=model.view.selection,context={...this.#context(),model},input=readClipboardInput(data,this.#interchange,selection?.kind==="grid"),clipboard=input.fragment;
   let projection:RichClipboardTextProjection|undefined,command:RichCommand|DocumentIntent;
   if(selection?.kind==="document"&&this.#document){if(clipboard)command={kind:"pasteDocumentClipboard",clipboardJson:clipboard,prefix:this.#allocate("paste")};else{if(!input.plain)return;command={kind:"replaceDocumentPlainText",paragraph:this.#allocate("p"),text:input.plain};}}
   else if(clipboard){const kind=(JSON.parse(clipboard) as {kind:string}).kind,allocation={prefix:this.#allocate("paste"),replica:"1",counter:String(this.#counter++),lamport:revision};
    if(kind==="text"){if(this.#general&&selection?.kind==="text"){if(this.#options.core.supportsGeneralInlinePaste?.()!==true)throw Error("Use matching native general inline clipboard paste");command={kind:"pasteGeneralInlineClipboard",data:{selection,clipboardJson:clipboard,prefix:allocation.prefix}};}else command={kind:"pasteInlineClipboard",data:{clipboardJson:clipboard}};}
    else if(kind==="grid"&&selection?.kind==="grid")command={kind:"pasteGridClipboard",data:{clipboardJson:clipboard,allocation}};
    else if(selection?.kind==="text"){
     const core=this.#options.core,converted=core.supportsClipboardTextPolicy?.()===true?core.projectClipboardText!(selection,clipboard,revision):null;
     if(converted){projection=converted;command=this.#general?{kind:"replaceGeneralRangePlainText",data:{selection,text:converted.text,prefix:allocation.prefix}}:{kind:"insertPlainText",text:converted.text};}
     else {const right=this.#allocate("p");if(this.#general){if(core.supportsGeneralFlowPaste?.()!==true)throw Error("Use matching native general rich-flow clipboard paste");command={kind:"pasteGeneralFlowClipboard",data:{selection,clipboardJson:clipboard,allocation,prefix:allocation.prefix,right}};}else command={kind:"pasteFlowAtText",data:{clipboardJson:clipboard,allocation,right}};}
    }else command={kind:"pasteFlowClipboard",data:{clipboardJson:clipboard,allocation,position:positionAfter(context)}};
   }else {const plain=input.plain;if(!plain)return;command=this.#general&&selection?.kind==="text"?{kind:"replaceGeneralRangePlainText",data:{selection,text:plain,prefix:this.#allocate("range")}}:isStructuralRichLanguage(this.#options.core.richLanguageVersion?.())&&this.#options.core.supportsAtomEditing?.()===true&&selectedFlowAtom(model)?{kind:"replaceAtomPlainText",data:{paragraph:this.#allocate("p"),text:plain}}:{kind:"insertPlainText",text:plain};}
   this.#executeIntent(command,true,revision,display=>this.#clipboardComplete("paste",revision,input.formats,projection,display));
  });
 }
 #clipboardComplete(operation:RichClipboardInterchangeReport["operation"],revision:string,formats:readonly RichInterchangeFormatReport[],destination?:RichClipboardTextProjection,display=true):void {
  if(this.#disposed)return;
  if(this.#interchange&&(formats.length||destination)){const report=clipboardInterchangeReport(operation,revision,formats,destination),message=clipboardInterchangeStatus(report,this.#ui);if(display&&message)this.status.textContent=message;try{this.#options.onInterchange?.(report);}catch(error){this.#report(error);}}
  if(destination){if(display&&!this.#interchange)this.#pasteLoss(destination);else try{this.#options.onPasteLoss?.(destination);}catch(error){this.#report(error);}}
 }
 #files(files:readonly File[]):void {if(this.#options.core.view().readOnly===true)return;this.#boundary();this.#attempt(()=>{this.#sync();if(this.#model.view.selection?.kind==="document"){if(!this.#options.onDocumentFiles)throw Error("Whole-document image replacement requires a document-aware asset host");void Promise.resolve(this.#options.onDocumentFiles(files,this.#model.view.revision)).catch(error=>this.#report(error));return;}if(!this.#options.onFiles)throw Error("Image file insertion requires an asset host");void Promise.resolve(this.#options.onFiles(files,positionAfter(this.#context()))).catch(error=>this.#report(error));});}
 #replaceDocumentInput(text:string,typing:boolean):RichCommandOutcome|"queued" {const paragraph=this.#allocate("p");return this.#executeIntent(typing&&this.#model.view.historyGrouping==="typing-v1"?{kind:"replaceDocumentTypingText",paragraph,text,clockMs:this.#clock()}:{kind:"replaceDocumentPlainText",paragraph,text});}
 #pasteLoss(report:RichClipboardTextProjection):void{this.status.textContent=this.#ui.text("pasteLoss",clipboardProjectionText(report,this.#ui));try{this.#options.onPasteLoss?.(report);}catch(error){this.#report(error);}}
 #startComposition():void {if(this.#composition||this.#model.view.readOnly===true)return;this.#boundary();this.#attempt(()=>{if(this.#model.view.readOnly===true)return;this.#sync();const selection=this.#model.view.selection;if(selection?.kind==="document"&&this.#document){this.#composition={document:true,revision:this.#model.view.revision,finishing:false};return;}if(selection?.kind!=="text")return;const cross=selection.anchor.block!==selection.focus.block;if(cross&&!this.#general)return;const node=this.#model.nodes.get(selection.focus.block);if(node)this.#composition={block:id(node),original:text(node),revision:this.#model.view.revision,finishing:false,...(cross?{target:structuredClone(selection)}:{})};});this.#notifySearch();}
 #endComposition(committedText:string):void {
  const composition=this.#composition;if(!composition)return;composition.finishing=true;
  this.surface.ownerDocument.defaultView?.requestAnimationFrame(()=>{
   if(this.#disposed||this.#composition!==composition)return;
   if("document" in composition){
    this.#composition=undefined;const pending=this.#queue;this.#queue=[];
    try{if(committedText)this.#executeIntent({kind:"replaceDocumentPlainText",paragraph:this.#allocate("p"),text:committedText},true,composition.revision);}
    catch(error){this.#report(error);}
    finally{for(const work of pending){try{this.#repeatWork(work);}catch(error){this.#report(error);}}this.#reconcile();this.#notifySearch();}
    return;
   }
   // The browser may provisionally rewrite several containers. Only its final committed
   // composition text crosses the native general target; never reverse-engineer that DOM.
   if(composition.target){
    this.#composition=undefined;const pending=this.#queue;this.#queue=[];
    try{if(committedText)this.execute({kind:"replaceGeneralRangePlainText",data:{selection:composition.target,text:committedText,prefix:this.#allocate("range")}},true,composition.revision);}
    catch(error){this.#report(error);}
    finally{for(const work of pending){try{this.#repeatWork(work);}catch(error){this.#report(error);}}this.#reconcile();this.#notifySearch();}
    return;
   }
   const block=[...this.surface.querySelectorAll<HTMLElement>("[data-rich-text]")].find(node=>node.dataset["richText"]===composition.block),final=block?.textContent??composition.original;
   let prefix=0;while(prefix<composition.original.length&&prefix<final.length&&composition.original[prefix]===final[prefix])prefix++;
   if(prefix>0&&/[\uDC00-\uDFFF]/.test(composition.original[prefix]??final[prefix]??""))prefix--;
   let oldEnd=composition.original.length,newEnd=final.length;
   while(oldEnd>prefix&&newEnd>prefix&&composition.original[oldEnd-1]===final[newEnd-1]){oldEnd--;newEnd--;}
   if(oldEnd<composition.original.length&&/[\uDC00-\uDFFF]/.test(composition.original[oldEnd]??"")){oldEnd++;newEnd++;}
   this.#composition=undefined;
   const pending=this.#queue;this.#queue=[];
   try {if(composition.original!==final){const point={block:composition.block,affinity:"after" as const};this.execute({kind:"replaceTextRange",data:{selection:{kind:"text",anchor:{...point,offset:String(prefix)},focus:{...point,offset:String(oldEnd)}},text:final.slice(prefix,newEnd)}},true,composition.revision);}}
   catch(error){this.#report(error);}
   finally {for(const work of pending){try{this.#repeatWork(work);}catch(error){this.#report(error);}}this.#reconcile();this.#notifySearch();}
  });
 }
 /** Unmount the surface and release its transferred exclusive core owner. */
 dispose():void {if(this.#disposed)return;this.#disposed=true;this.#placeholder?.dispose();this.#abort.abort();this.#cancelQueue(Error("The rich DOM editor is disposed"));this.#notifySearch();this.#searchEvents.clear();this.#writingEvents.clear();this.#root.replaceChildren();delete this.#root.dataset["breditorRich"];this.#options.core.dispose();}
}
export function mountRichEditor(root:HTMLElement,options:RichEditorOptions):RichDomEditor{return new RichDomEditor(root,options);}
/** Opt-in extended coordinator; ordinary mounts and original execute/selection DTOs stay closed. */
export function mountDocumentRichEditor(root:HTMLElement,options:RichDocumentEditorOptions):RichDomEditor<"document-v1"> {return new RichDomEditor<"document-v1">(root,options);}
const styles=`[data-breditor-rich]{color:#173d37;font:16px system-ui,sans-serif;max-width:1100px;margin:auto}[data-breditor-rich] .breditor-rich-toolbar{display:flex;flex-wrap:wrap;align-items:end;gap:6px;padding:12px;background:#eef3ef;border:1px solid #bdcdc5;border-radius:10px 10px 0 0}[data-breditor-rich] button{padding:6px 9px;border:1px solid #aabbb3;border-radius:5px;background:white;color:inherit;cursor:pointer}[data-breditor-rich] button:disabled{opacity:.45;cursor:default}[data-breditor-rich] label{display:grid;font-size:12px;gap:3px}[data-breditor-rich] input{width:110px;padding:6px}[data-breditor-rich] .breditor-rich-surface{padding:20px;border:1px solid #bdcdc5;min-height:280px;outline:none;background:white}[data-breditor-rich] .breditor-rich-surface:focus{box-shadow:inset 0 0 0 2px #398a79}[data-breditor-rich] p,[data-breditor-rich] h1,[data-breditor-rich] h2,[data-breditor-rich] h3{white-space:pre-wrap}[data-breditor-rich] table{border-collapse:collapse;table-layout:fixed;margin:16px 0;max-width:100%}[data-breditor-rich] td,[data-breditor-rich] th{border:1px solid #91aaa0;padding:8px;vertical-align:top;min-width:80px}[data-breditor-rich] th{background:#eaf1ee}[data-breditor-rich] [data-select-cell]{font-size:10px;color:#527269;padding:2px 5px}[data-breditor-rich] [data-source-cell]+[data-source-cell]{border-top:1px dashed #b6c8c0}[data-breditor-rich] [data-selected]{box-shadow:inset 0 0 0 3px #398a79;background:#edf8f3}[data-breditor-rich] [data-node-selected]{outline:3px solid #398a79}[data-breditor-rich] figure{padding:12px;background:#f5f8f6;border:1px solid #d8e3dc;margin:16px 0}[data-breditor-rich] img{max-width:100%;object-fit:contain;display:block;min-width:40px;min-height:30px}[data-breditor-rich] figcaption{margin-top:8px;color:#527269}[data-breditor-rich] caption[data-rich-table-caption]{padding-top:8px;color:#527269;text-align:start}[data-breditor-rich] .breditor-rich-status{font-size:12px;color:#527269}`;
