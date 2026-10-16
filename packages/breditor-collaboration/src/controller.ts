import {isStructuralRichLanguage} from "@breditor/experimental-rich-content/rendering";
import {model,id,text,sourceCell,render,requireRenderOptions,paintSelection,refreshAssets,readNative,readTarget,restoreNative,standardInlineStylesV1,structuralBlockStylesV2,type RichModel,type RichView,type RenderOptions} from "@breditor/experimental-rich-content/rendering";
import {SharedRichEditor,SharedEditorError} from "./core.js";
import {bold,boundaryDelete,caret,cellBlock,enter,positionAfter,removeSelection,type ActionContext,type SharedToolbarControl} from "./actions.js";
import {defaultSharedToolbar,moveSharedToolbar} from "./toolbar.js";
import type {SharedDispatch,SharedPublication,RichSelection,Navigation} from "./types.js";
import {sharedTaskTab} from "./task_actions_v2.js";
import {flowEdgeEligible,selectedFlowAtom} from "@breditor/experimental-rich-content/rendering";
import {mountToolbarControl,toolbarControlStyles,isCurrentCaretTarget,type RichControlView} from "@breditor/experimental-rich-content/rendering";
import {standardSelectionInlineControls,selectionFormatChanges} from "@breditor/experimental-rich-content/rendering";
import {blockLayoutShortcut} from "@breditor/experimental-rich-content/rendering";
export interface SharedDomOptions extends RenderOptions {
 core:SharedRichEditor;toolbar?:readonly SharedToolbarControl[];label?:string;image?:{asset:string;alt:string};
 /** Existing default transfers the owner. Borrow only when a persistent session owns its closure. */
 coreOwnership?:"transfer"|"borrow";
 onChange?:(event:SharedPublication)=>void|Promise<void>;onError?:(error:unknown)=>void;
 onFiles?:(files:readonly File[],position:{parent:string|null;before:string|null},revision:string)=>void|Promise<void>;
}
interface Work {run:(context:ActionContext)=>void;revision:string;focus:boolean;boundary:boolean}
interface Composition {block:string;original:string;revision:string;release:()=>void;target?:Extract<RichSelection,{kind:"text"}>}
function sameSelection(a:RichSelection|null,b:RichSelection|null):boolean{
 if(a?.kind!==b?.kind)return false;if(!a||!b)return a===b;
 if(a.kind==="node"&&b.kind==="node")return a.block===b.block;
 if(a.kind==="text"&&b.kind==="text")return a.anchor.block===b.anchor.block&&a.anchor.offset===b.anchor.offset&&a.anchor.affinity===b.anchor.affinity&&a.focus.block===b.focus.block&&a.focus.offset===b.focus.offset&&a.focus.affinity===b.focus.affinity;
 if(a.kind==="grid"&&b.kind==="grid")return a.anchor.table===b.anchor.table&&a.anchor.row===b.anchor.row&&a.anchor.column===b.anchor.column&&a.focus.table===b.focus.table&&a.focus.row===b.focus.row&&a.focus.column===b.focus.column;return false;
}
/** DOM coordinator only. Native Rust observations authorize every mutation and history operation. */
export class SharedDomEditor {
 readonly surface:HTMLDivElement;readonly toolbar:HTMLDivElement;readonly status:HTMLParagraphElement;
 #root:HTMLElement;#options:SharedDomOptions;#model:RichModel;#abort=new AbortController();#unsubscribe:()=>void;
 #disposed=false;#busy=false;#refreshing=false;#logical=false;#queue:Work[]=[];#composition:Composition|undefined;#reportedError:{error:unknown}|undefined;
 #prefix=`shared:${crypto.randomUUID()}`;#counter=0n;#controls:{control:SharedToolbarControl;view:RichControlView<ActionContext>}[]=[];
 constructor(root:HTMLElement,options:SharedDomOptions){
  this.#root=root;this.#options=options;this.#model=this.#read();this.#logical=this.#model.view.selection?.kind==="grid"||this.#model.view.selection?.kind==="node";
  requireRenderOptions(this.#model,options);
  if(this.#model.view.historyGrouping==="typing-v1"&&!options.core.supportsTypingHistory())throw Error("Use matching native shared typing history");
  for(const control of options.toolbar??[...defaultSharedToolbar,...moveSharedToolbar])if(control.owner!==undefined&&control.owner!==options.core)throw Error("Toolbar control belongs to a different Rust owner");
  const d=root.ownerDocument,style=d.createElement("style");style.textContent=styles+standardInlineStylesV1+toolbarControlStyles+structuralBlockStylesV2.replaceAll("[data-breditor-rich]","[data-breditor-shared]");root.dataset["breditorShared"]="";
  this.surface=d.createElement("div");this.surface.contentEditable="true";this.surface.className="breditor-shared-surface";this.surface.setAttribute("role","textbox");this.surface.setAttribute("aria-multiline","true");this.surface.setAttribute("aria-label",options.label??"Shared rich text editor");
  this.toolbar=d.createElement("div");this.toolbar.className="breditor-shared-toolbar";this.toolbar.setAttribute("role","toolbar");this.toolbar.setAttribute("aria-label","Shared rich text controls");this.status=d.createElement("p");this.status.setAttribute("role","status");
  const seen=new Set<string>();for(const control of options.toolbar??[...defaultSharedToolbar,...moveSharedToolbar]){
   if(seen.has(control.id))throw Error("Duplicate shared toolbar control");seen.add(control.id);
   const view=mountToolbarControl(this.toolbar,control,{prefix:"shared",signal:this.#abort.signal,sync:()=>this.#sync(),stamp:()=>JSON.stringify(options.core.view()),attempt:work=>this.#attempt(work),focus:()=>this.focus(),run:(value,fields)=>this.#perform(c=>control.run(c,value,fields))});this.#controls.push({control,view});
  }
  root.replaceChildren(style,this.toolbar,this.surface,this.status);render(this.surface,this.#model,options);this.#refreshControls();
  if(this.#model.view.readOnly===true)this.status.textContent=`Read-only · shared revision ${this.#model.view.revision}`;
  this.#unsubscribe=options.core.subscribe(event=>{const policy=event.view.readOnlyRevision!==this.#model.view.readOnlyRevision||event.view.readOnly!==this.#model.view.readOnly;if(policy){const composition=this.#composition;this.#composition=undefined;this.#queue=[];composition?.release();this.#refresh(false);}else if(!this.#busy&&!this.#composition)this.#refresh(false);try{void Promise.resolve(options.onChange?.(event)).catch(error=>this.#report(error));}catch(error){this.#report(error);}});
  const signal=this.#abort.signal;
  this.surface.addEventListener("beforeinput",event=>this.#input(event as InputEvent),{signal});
  this.surface.addEventListener("input",()=>{if(!this.#composition)this.#refresh(false,true);},{signal});
  this.surface.addEventListener("keydown",event=>this.#key(event),{signal});
  this.surface.addEventListener("pointerdown",event=>this.#pick(event),{signal});
  this.surface.addEventListener("blur",()=>this.#boundary(),{capture:true,signal});
  this.toolbar.addEventListener("pointerdown",()=>this.#boundary(),{capture:true,signal});
  this.toolbar.addEventListener("focusin",()=>this.#boundary(),{capture:true,signal});
  this.surface.addEventListener("click",event=>this.#taskCheck(event),{signal});
  this.surface.addEventListener("copy",event=>this.#copy(event,false),{signal});this.surface.addEventListener("cut",event=>this.#copy(event,true),{signal});this.surface.addEventListener("paste",event=>this.#paste(event),{signal});
  this.surface.addEventListener("dragover",event=>{if(event.dataTransfer?.types.includes("Files"))event.preventDefault();},{signal});this.surface.addEventListener("drop",event=>{if(event.dataTransfer?.files.length){event.preventDefault();this.#files([...event.dataTransfer.files]);}},{signal});
  this.surface.addEventListener("compositionstart",()=>this.#startComposition(),{signal});this.surface.addEventListener("compositionend",event=>this.#endComposition(event.data),{signal});
  d.addEventListener("selectionchange",()=>{if(!this.#busy&&!this.#composition)this.#attempt(()=>this.#sync());},{signal});
 }
 #read():RichModel{const view=this.#options.core.view();return model({...view,format:"breditor/rich-view"} satisfies RichView);}
 #live():void{if(this.#disposed)throw new SharedEditorError("disposed","The shared DOM editor is disposed");}
 #allocate=(kind:string):string=>`${this.#prefix}:${kind}:${this.#counter++}`;
 #context():ActionContext{const value:ActionContext={core:this.#options.core,model:this.#model,revision:this.#model.view.revision,allocate:this.#allocate};if(this.#options.image)value.image=this.#options.image;return value;}
 #report(error:unknown):void{if(this.#disposed)return;this.#reportedError={error};this.status.textContent=error instanceof Error?error.message:String(error);try{this.#options.onError?.(error);}catch{/* A callback cannot rewind committed state. */}}
 #alreadyReported(error:unknown):boolean{return this.#reportedError!==undefined&&this.#reportedError.error===error;}
 #attempt(run:()=>void):void{this.#reportedError=undefined;try{run();}catch(error){if(!this.#alreadyReported(error)){this.#refresh(false);this.#report(error);}}}
 #refreshControls():void{const context=this.#context(),stamp=JSON.stringify(this.#options.core.view());for(const {control,view}of this.#controls)view.refresh(context,control.enabled(context)&&(this.#model.view.readOnly!==true||control.readOnlySafe===true),stamp);}
 #refresh(focus:boolean,force=false):void{
  if(this.#disposed||this.#composition)return;this.#refreshing=true;try{const previous=this.#model.view.documentJson,policy=this.#model.view.readOnlyRevision,active=this.surface.ownerDocument.activeElement,ownedFocus=active===this.surface||!!active&&this.surface.contains(active);
  this.#model=this.#read();this.#logical=this.#model.view.selection?.kind==="grid"||this.#model.view.selection?.kind==="node";
  if(force||previous!==this.#model.view.documentJson||policy!==this.#model.view.readOnlyRevision)render(this.surface,this.#model,this.#options);else paintSelection(this.surface,this.#model);
  if(focus||ownedFocus){this.surface.focus({preventScroll:true});restoreNative(this.surface,this.#model.view.selection);}this.#refreshControls();
  this.status.textContent=`${this.#model.view.readOnly===true?"Read-only · ":""}Shared revision ${this.#model.view.revision} · ${this.#model.view.undoDepth} undo · ${this.#options.core.pendingRemote().frames} pending remote`;
  }finally{this.#refreshing=false;}
 }
 #sync():void{if(this.#busy||this.#composition||this.#logical)return;const active=this.surface.ownerDocument.activeElement;if(active!==this.surface&&(!active||!this.surface.contains(active)))return;const selection=readNative(this.surface,this.#model);if(selection&&!sameSelection(selection,this.#model.view.selection))this.#perform(c=>{c.core.select(selection,c.revision);},false);}
 #perform(run:(context:ActionContext)=>void,focus=true,revision=this.#model.view.revision,boundary=false):void{
  this.#live();if(this.#queue.length>=128)throw Error("Shared editor command queue is full");this.#queue.push({run,focus,revision,boundary});if(this.#busy||this.#composition)return;
  const release=this.#options.core.holdRemotes();this.#busy=true;let error:unknown,drained=0;
  try{while(!this.#disposed&&this.#queue.length){if(++drained>128){this.#queue=[];throw Error("Shared editor callback command loop exceeded its bound");}const next=this.#queue.shift()!;
   try{if(next.revision!==this.#options.core.view().revision)throw new SharedEditorError("stale_observation","Queued work was prepared from an older publication");next.run(this.#context());if(next.boundary){this.#model=this.#read();this.#refreshControls();}else this.#refresh(next.focus);}catch(e){error??=e;this.#refresh(false);this.#report(e);}
  }}finally{this.#busy=false;release();}if(error!==undefined)throw error;
 }
 execute(request:SharedDispatch,focus=true,revision=this.#model.view.revision):void{const frozen=JSON.parse(JSON.stringify(request)) as SharedDispatch;this.#perform(c=>{c.core.dispatch(frozen,c.revision);},focus,revision);}
 select(selection:RichSelection|null,focus=true):void{const frozen=structuredClone(selection);this.#perform(c=>{c.core.select(frozen,c.revision);},focus);}
 view():ReturnType<SharedRichEditor["view"]>{this.#live();return this.#options.core.view();}
 checkpointJson():string{this.#live();return this.#options.core.checkpointJson();}
 focus():void{this.#live();this.surface.focus();restoreNative(this.surface,this.#model.view.selection);}
 /** Read-only retry after independently transferred image bytes become available. */
 refreshAssets():void{this.#live();refreshAssets(this.surface,this.#options);}
 setReadOnly(value:boolean,revision=this.#options.core.view().revision):boolean{this.#live();if(this.#busy)throw Error("Editing policy cannot publish reentrantly");return this.#options.core.setReadOnly(value,revision);}
 /** Native intent fence: update cached publication/controls, never replace children or move focus. */
 closeTypingGroup(revision=this.#options.core.view().revision):boolean{this.#live();if(this.#busy||this.#composition)throw Error("History boundaries cannot publish during a command or composition");if(this.#model.view.historyGrouping!=="typing-v1")return false;let changed=false;this.#perform(c=>{changed=c.core.closeTypingGroup(c.revision);},false,revision,true);return changed;}
 #boundary():void{if(this.#model.view.historyGrouping==="typing-v1"&&!this.#busy&&!this.#refreshing&&!this.#composition)this.#attempt(()=>{this.closeTypingGroup();});}
 #clock():string{const value=Math.floor(this.surface.ownerDocument.defaultView!.performance.now());if(!Number.isSafeInteger(value)||value<0)throw Error("Expected a finite monotonic typing clock");return String(value);}
 #deleteInput(c:ActionContext,selection:Extract<RichSelection,{kind:"text"}>,backward:boolean,inputType:string):void{
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
 #key(event:KeyboardEvent):void{if(this.#composition||event.isComposing)return;const mod=event.metaKey||event.ctrlKey,key=event.key.toLowerCase();
  if(mod&&!["Backspace","Delete"].includes(event.key)||["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown","Tab","Enter","Escape"].includes(event.key))this.#boundary();
  const widget=(event.target as Element).closest("input,button,select,textarea");
  if(widget&&!(mod&&!event.altKey&&["z","y"].includes(key))){
   if(["Backspace","Delete"].includes(event.key)&&widget.matches("button,input[type=checkbox],input[type=radio]"))event.preventDefault();
   return;
  }
  if(this.#model.view.readOnly===true&&(["Backspace","Delete","Enter"].includes(event.key)||!mod&&!event.altKey&&[...event.key].length===1||mod&&!event.altKey&&["z","y","b","i","u","k"].includes(key))){event.preventDefault();return;}
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
  if(mod&&key==="a")this.#logical=false;
  if(mod&&!event.altKey){const shortcut=`${event.shiftKey?"shift+":""}${key}`,control=this.#controls.find(item=>item.control.shortcut===shortcut);if(control){event.preventDefault();this.#attempt(()=>{this.#sync();control.view.activate();});return;}}
  const nativeShortcut=({b:"bold",i:"italic",u:"underline","shift+x":"strike"} as Record<string,string>)[`${event.shiftKey?"shift+":""}${key}`];
  if(mod&&!event.altKey&&nativeShortcut&&isStructuralRichLanguage(this.#options.core.richLanguageVersion())&&this.#options.core.supportsSelectionFormatting()&&this.#options.inlinePresentation){event.preventDefault();this.#attempt(()=>{this.#sync();this.#selectionFormat(nativeShortcut);});return;}
  if(mod&&!event.altKey&&["z","y","b"].includes(key)){event.preventDefault();this.#attempt(()=>{this.#sync();this.#perform(c=>{if(key==="b")bold(c);else if(key==="y"||event.shiftKey)c.core.redo(c.revision);else c.core.undo(c.revision);});});return;}
  // WebKit can report insertParagraph for Shift+Enter. Resolve the keyboard
  // contract here without changing composition, grid Enter or beforeinput targets.
  if(event.key==="Enter"&&event.shiftKey&&!mod&&!event.altKey){this.#attempt(()=>{this.#sync();if(this.#model.view.selection?.kind==="text"){event.preventDefault();this.#perform(c=>{const s=c.model.view.selection;if(c.model.view.rangeEditing==="general-v1"&&s?.kind==="text")c.core.replaceGeneralRangePlainText(s,"\n",c.allocate("range"),c.revision);else c.core.hardBreak(c.revision);});}});if(event.defaultPrevented)return;}
  if(this.#model.view.readOnly!==true&&event.key==="Tab"&&!mod&&!event.altKey){this.#attempt(()=>{this.#sync();const command=sharedTaskTab(this.#context(),event.shiftKey);if(command){event.preventDefault();this.#perform(c=>{c.core.dispatch({commands:[command]},c.revision);});}});if(event.defaultPrevented)return;}
  const s=this.#model.view.selection;if(s?.kind==="grid"){
   const moves:Record<string,Navigation>={ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down",Tab:event.shiftKey?"previous":"next",Home:mod?"tableStart":"rowStart",End:mod?"tableEnd":"rowEnd"},move=moves[event.key];
   if(move){this.#attempt(()=>this.#perform(c=>{const result=c.core.navigate(move,event.key!=="Tab"&&event.shiftKey,c.revision);if(event.key!=="Tab"||result.kind!=="boundary")event.preventDefault();}));return;}
   if(event.key==="Enter"||event.key==="Escape"){event.preventDefault();const block=this.#model.textBlocks.find(n=>{const cell=sourceCell(this.#model,id(n));return cell?.table===s.focus.table&&cell.row===s.focus.row&&cell.column===s.focus.column;});if(block)this.select(caret(id(block)));return;}
  }
  if((s?.kind==="node"||s?.kind==="grid")&&(event.key==="Backspace"||event.key==="Delete")){event.preventDefault();this.#attempt(()=>this.#perform(c=>removeSelection(c,event.key==="Backspace"?"before":"after")));}
 }
 #input(event:InputEvent):void{if(this.#model.view.readOnly===true){event.preventDefault();return;}if(this.#composition||event.isComposing)return;event.preventDefault();this.#attempt(()=>{this.#sync();const kind=event.inputType;
  if(kind!=="insertText"&&!kind.startsWith("delete"))this.#boundary();
  const action=({formatBold:"bold",formatItalic:"italic",formatUnderline:"underline",formatStrikeThrough:"strike",formatSubscript:"subscript",formatSuperscript:"superscript"} as Record<string,string>)[kind],control=this.#controls.find(item=>item.control.id===action);if(control){control.view.activate();return;}
  if(this.#selectionFormat(action))return;
  this.#perform(c=>{if(kind==="historyUndo"){c.core.undo(c.revision);return;}if(kind==="historyRedo"){c.core.redo(c.revision);return;}if(kind==="formatBold"){bold(c);return;}
   if((kind==="insertParagraph"||kind==="insertLineBreak")&&isStructuralRichLanguage(c.core.richLanguageVersion())&&c.core.supportsFlowNavigation()&&selectedFlowAtom(c.model)){c.core.insertParagraphAdjacent(c.allocate("p"),kind==="insertLineBreak"?"before":"after",c.revision);return;}
   if(kind==="insertParagraph"){enter(c);return;}
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
  });
 });}
 #copy(event:ClipboardEvent,cut:boolean):void{
  if(!event.clipboardData)return;if(this.#composition||this.#busy){event.preventDefault();return;}if(this.#model.view.rangeEditing==="general-v1")event.preventDefault();this.#boundary();
  this.#attempt(()=>{this.#sync();this.#perform(c=>{
   const general=c.model.view.rangeEditing==="general-v1",content=general?c.core.copyGeneral():c.core.copy();if(!content)return;
   event.preventDefault();event.clipboardData!.setData("text/plain",content.plainText);event.clipboardData!.setData("application/x-breditor-rich+json",content.richJson);
   if(!event.clipboardData!.types.includes("text/plain")||event.clipboardData!.getData("text/plain")!==content.plainText)throw Error("Clipboard did not retain text; content was not cut");
   if(cut&&c.model.view.readOnly!==true){const selection=c.model.view.selection;if(general&&selection?.kind==="text")c.core.replaceGeneralRangePlainText(selection,"",c.allocate("range"));else removeSelection(c);}
  },false);});
 }
 #paste(event:ClipboardEvent):void{if(this.#model.view.readOnly===true){event.preventDefault();return;}if(!event.clipboardData)return;event.preventDefault();if(this.#composition||this.#busy)return;
  this.#boundary();
  this.#attempt(()=>{const transfer=event.clipboardData!,files=[...transfer.files];if(files.length){this.#files(files);return;}
   // Clipboard stores are event-scoped. Capture strings before preparing/queuing work,
   // and never interpret an empty or unsupported transfer as a selection deletion.
   const fragment=transfer.getData("application/x-breditor-rich+json"),plain=transfer.getData("text/plain");if(!fragment&&!plain)return;
   this.#sync();this.#perform(c=>{
    const s=c.model.view.selection,general=c.model.view.rangeEditing==="general-v1";
    if(!fragment){if(general&&s?.kind==="text")c.core.replaceGeneralRangePlainText(s,plain,c.allocate("range"),c.revision);else if(isStructuralRichLanguage(c.core.richLanguageVersion())&&c.core.supportsAtomEditing()&&selectedFlowAtom(c.model))c.core.replaceAtomPlainText(c.allocate("p"),plain,c.revision);else c.core.type(plain,c.revision);return;}
    const kind=(JSON.parse(fragment) as {kind:string}).kind,prefix=c.allocate("paste");
    if(kind==="text"){if(general&&s?.kind==="text")c.core.pasteGeneralInlineClipboard(s,fragment,prefix,c.revision);else c.core.paste(fragment,{kind:"text"},prefix,c.revision);}
    else if(kind==="grid"&&s?.kind==="grid")c.core.paste(fragment,{kind:"grid"},prefix,c.revision);
    else if(s?.kind==="text"){if(general)c.core.pasteGeneralFlowClipboard(s,fragment,c.allocate("right"),prefix,c.revision);else c.core.pasteAtText(fragment,c.allocate("right"),prefix,c.revision);}
    else c.core.paste(fragment,{kind:"flow",...positionAfter(c)},prefix,c.revision);
   });});
 }
 #files(files:readonly File[]):void{if(this.#options.core.view().readOnly===true)return;this.#boundary();this.#attempt(()=>{this.#sync();if(!this.#options.onFiles)throw Error("Image files require an asset host");const position=positionAfter(this.#context()),revision=this.#model.view.revision;void Promise.resolve(this.#options.onFiles(files,position,revision)).catch(error=>this.#report(error));});}
 #startComposition():void{if(this.#model.view.readOnly===true)return;this.#boundary();this.#attempt(()=>{this.#sync();const s=this.#model.view.selection;if(s?.kind!=="text")return;const cross=s.anchor.block!==s.focus.block;if(cross&&this.#model.view.rangeEditing!=="general-v1")return;const n=this.#model.nodes.get(s.focus.block);if(n)this.#composition={block:id(n),original:text(n),revision:this.#model.view.revision,release:this.#options.core.holdRemotes(),...(cross?{target:structuredClone(s)}:{})};});}
 #endComposition(committedText:string):void{const composition=this.#composition;if(!composition)return;this.surface.ownerDocument.defaultView?.requestAnimationFrame(()=>{
  if(this.#disposed||this.#composition!==composition)return;
  if(composition.target){
   this.#composition=undefined;const pending=this.#queue;this.#queue=[];
   try{if(committedText)this.#perform(c=>{c.core.replaceGeneralRangePlainText(composition.target!,committedText,c.allocate("range"),c.revision);},true,composition.revision);}
   catch(error){this.#report(error);}
   finally{for(const work of pending)this.#attempt(()=>this.#perform(work.run,work.focus,work.revision));this.#refresh(false,true);composition.release();}
   return;
  }
  if(this.#disposed||this.#composition!==composition)return;const node=[...this.surface.querySelectorAll<HTMLElement>("[data-rich-text]")].find(n=>n.dataset["richText"]===composition.block),final=node?.textContent??composition.original;let start=0;while(start<composition.original.length&&start<final.length&&composition.original[start]===final[start])start++;if(start>0&&/[\uDC00-\uDFFF]/.test(composition.original[start]??final[start]??""))start--;
  let oldEnd=composition.original.length,newEnd=final.length;while(oldEnd>start&&newEnd>start&&composition.original[oldEnd-1]===final[newEnd-1]){oldEnd--;newEnd--;}if(oldEnd<composition.original.length&&/[\uDC00-\uDFFF]/.test(composition.original[oldEnd]??"")){oldEnd++;newEnd++;}
  this.#composition=undefined;const pending=this.#queue;this.#queue=[];
  try{if(composition.original!==final){const point={block:composition.block,affinity:"after" as const};this.#perform(c=>{c.core.replace({kind:"text",anchor:{...point,offset:String(start)},focus:{...point,offset:String(oldEnd)}},final.slice(start,newEnd),c.revision);},true,composition.revision);}}
  catch(error){this.#report(error);}finally{for(const work of pending)this.#attempt(()=>this.#perform(work.run,work.focus,work.revision));this.#refresh(false);composition.release();}
 });}
 dispose():void{if(this.#disposed)return;this.#disposed=true;this.#unsubscribe();this.#abort.abort();this.#queue=[];if(this.#options.coreOwnership!=="borrow")this.#options.core.dispose();this.#composition?.release();this.#composition=undefined;this.#root.replaceChildren();delete this.#root.dataset["breditorShared"];}
}
export const mountSharedEditor=(root:HTMLElement,options:SharedDomOptions):SharedDomEditor=>new SharedDomEditor(root,options);
const styles=`[data-breditor-shared]{color:#173d37;font:15px system-ui,sans-serif}[data-breditor-shared] .breditor-shared-toolbar{display:flex;gap:5px;flex-wrap:wrap;align-items:end;background:#edf2ef;padding:10px;border:1px solid #b6c7bf}[data-breditor-shared] button{padding:5px 8px;background:white;border:1px solid #a5b9af;border-radius:4px;color:inherit}[data-breditor-shared] button:disabled{opacity:.4}[data-breditor-shared] label{display:grid;font-size:11px;gap:3px}[data-breditor-shared] input{width:100px;padding:5px}[data-breditor-shared] .breditor-shared-surface{min-height:220px;padding:18px;border:1px solid #b6c7bf;background:white;outline:none;white-space:pre-wrap}[data-breditor-shared] .breditor-shared-surface:focus{box-shadow:inset 0 0 0 2px #378a77}[data-breditor-shared] p{min-height:1em}[data-breditor-shared] table{border-collapse:collapse;margin:10px 0;table-layout:fixed}[data-breditor-shared] td,[data-breditor-shared] th{border:1px solid #819e90;min-width:90px;padding:8px;vertical-align:top}[data-breditor-shared] [data-selected]{background:#e0f4e9}[data-breditor-shared] [data-node-selected]{outline:2px solid #378a77}[data-breditor-shared] figure{margin:10px 0;border:1px solid #a5b9af;padding:10px}[data-breditor-shared] img{max-width:100%;display:block}[data-breditor-shared] [data-source-cell]+[data-source-cell]{border-top:1px dashed #a5b9af}`;
