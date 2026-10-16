// One DOM coordinator around the exclusive Rust owner. Rendering and callbacks cannot publish reentrantly.
import type {FlowPosition,RichCommand,RichCommandOutcome,RichCoreEditor,RichSelection,RichView} from "./core.js";
import {bold,boundaryDelete,defaultToolbar,deleteSelection,enter,positionAfter,type ActionContext,type ToolbarControl} from "./actions.js";
import {id,model,sourceCell,text,type RichModel} from "./model.js";
import {paintSelection,render,requireRenderOptions,structuralBlockStylesV2,type RenderOptions} from "./render.js";
import {readNative,readTarget,restoreNative,isCurrentCaretTarget} from "./selection.js";
import {standardInlineStylesV1} from "./standard_inline_v1.js";
import {mountToolbarControl,toolbarControlStyles,type RichControlView} from "./toolbar_control_view.js";
import {taskTab} from "./task_actions_v2.js";

export interface RichEditorOptions extends RenderOptions {
 core:RichCoreEditor;
 toolbar?:readonly ToolbarControl[];
 label?:string;
 onChange?:(view:RichView,outcome:RichCommandOutcome)=>void;
 onError?:(error:unknown)=>void;
 onFiles?:(files:readonly File[],position:FlowPosition)=>void|Promise<void>;
}
function sameSelection(a:RichSelection|null,b:RichSelection|null):boolean {
 if(a?.kind!==b?.kind)return false;if(!a||!b)return a===b;
 if(a.kind==="node"&&b.kind==="node")return a.block===b.block;
 if(a.kind==="grid"&&b.kind==="grid")return a.anchor.table===b.anchor.table&&a.anchor.row===b.anchor.row&&a.anchor.column===b.anchor.column&&a.focus.table===b.focus.table&&a.focus.row===b.focus.row&&a.focus.column===b.focus.column;
 if(a.kind==="text"&&b.kind==="text")return a.anchor.block===b.anchor.block&&a.anchor.offset===b.anchor.offset&&a.anchor.affinity===b.anchor.affinity&&a.focus.block===b.focus.block&&a.focus.offset===b.focus.offset&&a.focus.affinity===b.focus.affinity;
 return false;
}
interface Work {command:RichCommand;revision:string;focus:boolean}
interface Composition {block:string;original:string;revision:string;finishing:boolean}
export class RichDomEditor {
 readonly surface:HTMLDivElement;
 readonly toolbar:HTMLDivElement;
 readonly status:HTMLParagraphElement;
 #root:HTMLElement;#options:RichEditorOptions;#model:RichModel;#abort=new AbortController();#queue:Work[]=[];#busy=false;#disposed=false;#composition:Composition|undefined;
 #namespace:string;#counter=0n;#logicalSelection=false;#controls:{control:ToolbarControl;view:RichControlView<ActionContext>}[]=[];
 constructor(root:HTMLElement,options:RichEditorOptions){
  this.#root=root;this.#options=options;this.#model=model(options.core.view());this.#namespace=`br:${crypto.randomUUID()}`;this.#logicalSelection=this.#model.view.selection?.kind==="grid"||this.#model.view.selection?.kind==="node";
  requireRenderOptions(this.#model,options);
  if(this.#model.view.historyGrouping==="typing-v1"&&(options.core.supportsTypingHistory?.()!==true||!options.core.closeTypingGroup))throw Error("Use matching native natural typing history");
  for(const control of options.toolbar??defaultToolbar)if(control.owner!==undefined&&control.owner!==options.core)throw Error("Toolbar control belongs to a different Rust owner");
  const document=root.ownerDocument;this.surface=document.createElement("div");this.surface.className="breditor-rich-surface";this.surface.contentEditable="true";this.surface.setAttribute("role","textbox");this.surface.setAttribute("aria-multiline","true");this.surface.setAttribute("aria-label",options.label??"Rich text editor");
  this.toolbar=document.createElement("div");this.toolbar.className="breditor-rich-toolbar";this.toolbar.setAttribute("role","toolbar");this.toolbar.setAttribute("aria-label","Rich text formatting");
  this.status=document.createElement("p");this.status.className="breditor-rich-status";this.status.setAttribute("role","status");
  const style=document.createElement("style");style.textContent=styles+standardInlineStylesV1+toolbarControlStyles+structuralBlockStylesV2;root.dataset["breditorRich"]="";root.replaceChildren(style,this.toolbar,this.surface,this.status);
  const seen=new Set<string>();
  for(const control of options.toolbar??defaultToolbar){
   if(seen.has(control.id))throw Error("Duplicate rich toolbar control identity");seen.add(control.id);
   const view=mountToolbarControl(this.toolbar,control,{prefix:"rich",signal:this.#abort.signal,sync:()=>this.#sync(),stamp:()=>JSON.stringify(options.core.view()),attempt:work=>this.#attempt(work),focus:()=>this.focus(),run:(value,fields)=>{const command=control.command(this.#context(),value,fields);if(command)this.execute(command);}});
   this.#controls.push({control,view});
  }
  render(this.surface,this.#model,options);this.#refreshControls();
  if(this.#model.view.readOnly===true)this.status.textContent=`Read-only · revision ${this.#model.view.revision}`;
  this.surface.addEventListener("beforeinput",event=>this.#input(event as InputEvent),{signal:this.#abort.signal});
  this.surface.addEventListener("input",()=>{if(!this.#composition)this.#reconcile();},{signal:this.#abort.signal});
  this.surface.addEventListener("keydown",event=>this.#key(event),{signal:this.#abort.signal});
  this.surface.addEventListener("pointerdown",event=>this.#pick(event),{signal:this.#abort.signal});
  this.surface.addEventListener("blur",()=>this.#boundary(),{capture:true,signal:this.#abort.signal});
  this.toolbar.addEventListener("pointerdown",()=>this.#boundary(),{capture:true,signal:this.#abort.signal});
  this.toolbar.addEventListener("focusin",()=>this.#boundary(),{capture:true,signal:this.#abort.signal});
  this.surface.addEventListener("click",event=>this.#taskCheck(event),{signal:this.#abort.signal});
  this.surface.addEventListener("copy",event=>this.#copy(event,false),{signal:this.#abort.signal});
  this.surface.addEventListener("cut",event=>this.#copy(event,true),{signal:this.#abort.signal});
  this.surface.addEventListener("paste",event=>this.#paste(event),{signal:this.#abort.signal});
  this.surface.addEventListener("dragover",event=>{if(event.dataTransfer?.types.includes("Files"))event.preventDefault();},{signal:this.#abort.signal});
  this.surface.addEventListener("drop",event=>{if(event.dataTransfer?.files.length){event.preventDefault();this.#files([...event.dataTransfer.files]);}},{signal:this.#abort.signal});
  this.surface.addEventListener("compositionstart",()=>this.#startComposition(),{signal:this.#abort.signal});
  this.surface.addEventListener("compositionend",()=>this.#endComposition(),{signal:this.#abort.signal});
  document.addEventListener("selectionchange",()=>{if(!this.#busy&&!this.#composition)this.#attempt(()=>this.#sync());},{signal:this.#abort.signal});
 }
 #live():void {if(this.#disposed)throw Error("The rich DOM editor is disposed");}
 #allocate=(kind:string):string=>`${this.#namespace}:${kind}:${this.#counter++}`;
 #context():ActionContext{return {model:this.#model,allocate:this.#allocate,stamp:()=>({replica:"1",counter:String(this.#counter++),lamport:this.#model.view.revision})};}
 #attempt(work:()=>void):void {try{work();}catch(error){this.#report(error);this.#reconcile();}}
 #report(error:unknown):void {this.status.textContent=error instanceof Error?error.message:"Rich editor operation failed";try{this.#options.onError?.(error);}catch{/* A host callback cannot rewind committed content. */}}
 #refreshControls():void {
  const context=this.#context(),stamp=JSON.stringify(this.#options.core.view());for(const {control,view} of this.#controls)view.refresh(context,control.enabled(context)&&(this.#model.view.readOnly!==true||control.readOnlySafe===true),stamp);
 }
 #reconcile():void {if(this.#disposed||this.#composition)return;this.#model=model(this.#options.core.view());render(this.surface,this.#model,this.#options);restoreNative(this.surface,this.#model.view.selection);this.#refreshControls();}
 #sync():void {
  if(this.#composition||this.#busy||this.#logicalSelection)return;
  // Rendering while a host control owns focus can leave a collapsed browser
  // range in this surface. It is not an intentional editor selection change.
  const active=this.surface.ownerDocument.activeElement;
  if(active!==this.surface&&(!active||!this.surface.contains(active)))return;
  const selection=readNative(this.surface,this.#model);
  if(selection&&!sameSelection(selection,this.#model.view.selection))this.execute({kind:"setSelection",selection},false);
 }
 /** Commands prepared by asynchronous hosts should pass their observed revision. */
 execute(command:RichCommand,focus=true,expectedRevision=this.#model.view.revision):RichCommandOutcome|"queued" {
  this.#live();
  if(this.#queue.length>=128)throw Error("Rich editor command queue is full");
  this.#queue.push({command:JSON.parse(JSON.stringify(command)) as RichCommand,revision:expectedRevision,focus});
  if(this.#busy||this.#composition)return "queued";
  this.#busy=true;let first:RichCommandOutcome|undefined,drained=0;
  try {while(this.#queue.length){
   if(++drained>128){this.#queue=[];throw Error("Rich editor callback command loop exceeded its bound");}
   const work=this.#queue.shift()!;
   try {
    const active=this.surface.ownerDocument.activeElement,ownedFocus=active===this.surface||!!active&&this.surface.contains(active);
    const outcome=this.#options.core.execute(work.command,work.revision);first??=outcome;this.#model=model(this.#options.core.view());this.#logicalSelection=this.#model.view.selection?.kind==="grid"||this.#model.view.selection?.kind==="node";
    if(outcome==="content"||outcome==="undo"||outcome==="redo")render(this.surface,this.#model,this.#options);else paintSelection(this.surface,this.#model);
    // An asynchronous focus:false edit must retain an already-owned caret after
    // replacing children, but must not steal focus from an outside host control.
    if(work.focus||ownedFocus){this.surface.focus({preventScroll:true});restoreNative(this.surface,this.#model.view.selection);}
    this.#refreshControls();this.status.textContent=`${this.#model.view.readOnly===true?"Read-only · ":""}${outcome} · revision ${this.#model.view.revision}`;
    if(outcome!=="unchanged")this.#options.onChange?.(this.#options.core.view(),outcome);
   }catch(error){if(first===undefined)throw error;this.#report(error);}
  }}finally{this.#busy=false;}
  return first??"unchanged";
 }
 view():RichView {this.#live();return this.#options.core.view();}
 checkpointJson():string {this.#live();return this.#options.core.checkpointJson();}
 /** Close native continuation without rendering, moving focus, or inventing a content outcome. */
 closeTypingGroup(revision=this.#options.core.view().revision):boolean {
  this.#live();if(this.#busy||this.#composition)throw Error("History boundaries cannot publish during a command or composition");
  const core=this.#options.core;
  if(core.supportsTypingHistory?.()!==true||!core.closeTypingGroup){if(this.#model.view.historyGrouping==="typing-v1")throw Error("Use matching native typing history");return false;}
  const changed=core.closeTypingGroup(revision);if(changed){this.#model=model(core.view());this.#refreshControls();}return changed;
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
  this.execute({kind:"replaceTextRange",data:{selection,text:""}});
 }
 /** Change native host policy immediately, cancelling provisional composition and queued edits. */
 setReadOnly(value:boolean,revision=this.#options.core.view().revision):boolean {
  this.#live();if(this.#busy)throw Error("Editing policy cannot publish reentrantly");
  const core=this.#options.core;if(!core.setReadOnly||core.supportsReadOnly?.()!==true)throw Error("Use a matching native owner with read-only enforcement");
  const changed=core.setReadOnly(value,revision);if(changed){this.#composition=undefined;this.#queue=[];this.#reconcile();this.status.textContent=`${value?"Read-only":"Editable"} · revision ${this.#model.view.revision}`;}return changed;
 }
 focus():void {this.#live();this.surface.focus();restoreNative(this.surface,this.#model.view.selection);}
 #pick(event:PointerEvent):void {
  this.#boundary();
  const target=event.target as Element,button=target.closest<HTMLElement>("[data-select-cell]"),figure=target.closest<HTMLElement>("[data-rich-image]"),node=target.closest<HTMLElement>("[data-select-node]");
  if(button){event.preventDefault();const cell=JSON.parse(button.dataset["selectCell"]!) as Extract<RichSelection,{kind:"grid"}>["focus"],prior=this.#model.view.selection;const anchor=event.shiftKey&&prior?.kind==="grid"&&prior.anchor.table===cell.table?prior.anchor:cell;this.#attempt(()=>this.execute({kind:"setSelection",selection:{kind:"grid",anchor,focus:cell}}));}
  else if(node||(figure&&!target.closest("[data-rich-text]"))){event.preventDefault();const block=node?.dataset["selectNode"]??figure?.dataset["richBlock"];if(block)this.#attempt(()=>this.execute({kind:"setSelection",selection:{kind:"node",block}}));}
  else this.#logicalSelection=false;
 }
 #taskCheck(event:MouseEvent):void {
  const target=event.target as Element,check=target.closest<HTMLInputElement>("input[data-task-check]");if(!check||!this.surface.contains(check))return;
  event.preventDefault();if(this.#composition||this.#model.view.readOnly===true)return;
  const item=check.dataset["taskCheck"],node=item?this.#model.nodes.get(item):undefined;if(!node||node.type!=="breditor/task-item")return;
  this.#attempt(()=>{this.execute({kind:"setTaskChecked",data:{item:id(node),checked:node.properties["breditor/checked"]!==true}});[...this.surface.querySelectorAll<HTMLInputElement>("input[data-task-check]")].find(input=>input.dataset["taskCheck"]===item)?.focus({preventScroll:true});});
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
  if(this.#model.view.readOnly===true&&(["Backspace","Delete","Enter"].includes(event.key)||!mod&&!event.altKey&&event.key.length===1||mod&&!event.altKey&&["z","y","b","i","u","k"].includes(event.key.toLowerCase()))){event.preventDefault();return;}
  if(mod&&event.key.toLowerCase()==="a")this.#logicalSelection=false;
  if(mod&&!event.altKey){const key=`${event.shiftKey?"shift+":""}${event.key.toLowerCase()}`,control=this.#controls.find(item=>item.control.shortcut===key);if(control){event.preventDefault();this.#attempt(()=>{this.#sync();control.view.activate();});return;}}
  if(mod&&!event.altKey&&["z","y","b"].includes(event.key.toLowerCase())){event.preventDefault();this.#attempt(()=>{this.#sync();const key=event.key.toLowerCase(),command=key==="b"?bold(this.#context()):{kind:key==="y"||event.shiftKey?"redo":"undo"} as RichCommand;if(command)this.execute(command);});return;}
  // Own the keyboard meaning before a browser can translate Shift+Enter into
  // insertParagraph (observed in WebKit). Composition and grid navigation stay separate.
  if(event.key==="Enter"&&event.shiftKey&&!mod&&!event.altKey){
   this.#attempt(()=>{this.#sync();if(this.#model.view.selection?.kind==="text"){event.preventDefault();this.execute({kind:"insertHardBreak"});}});
   if(event.defaultPrevented)return;
  }
  const selection=this.#model.view.selection;
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
  if((selection?.kind==="grid"||selection?.kind==="node")&&(event.key==="Backspace"||event.key==="Delete")){event.preventDefault();this.#attempt(()=>{const command=deleteSelection(this.#context());if(command)this.execute(command);});}
 }
 #input(event:InputEvent):void {
  if(this.#model.view.readOnly===true){event.preventDefault();return;}
  if(this.#composition||event.isComposing)return;
  event.preventDefault();this.#attempt(()=>{
   this.#sync();const type=event.inputType;
   if(type!=="insertText"&&!type.startsWith("delete"))this.#boundary();
   const action=({formatBold:"bold",formatItalic:"italic",formatUnderline:"underline",formatStrikeThrough:"strike",formatSubscript:"subscript",formatSuperscript:"superscript"} as Record<string,string>)[type],control=this.#controls.find(item=>item.control.id===action);if(control){control.view.activate();return;}
   if(type==="historyUndo"||type==="historyRedo"){this.execute({kind:type==="historyUndo"?"undo":"redo"});return;}
   if(type==="formatBold"){const command=bold(this.#context());if(command)this.execute(command);return;}
   if(type==="insertParagraph"){const command=enter(this.#context());if(command)this.execute(command);return;}
   const selection=this.#model.view.selection;
   if(selection?.kind!=="text")return;
   const ranges=event.getTargetRanges?.()??[],target=ranges[0]?readTarget(this.surface,ranges[0]):null;
   if(type==="insertLineBreak"){this.execute(target&&!isCurrentCaretTarget(selection,target)?{kind:"replaceTextRange",data:{selection:target,text:"\n"}}:{kind:"insertHardBreak"});return;}
   if(type==="insertText"||type==="insertReplacementText"){
    const input=event.data??"",caret=selection.anchor.block===selection.focus.block&&selection.anchor.offset===selection.focus.offset;
    if(type==="insertText"&&caret&&this.#model.view.historyGrouping==="typing-v1"&&(!target||isCurrentCaretTarget(selection,target)))this.execute({kind:"insertTypingText",data:{text:input,clockMs:this.#clock()}});
    else this.execute(target&&!isCurrentCaretTarget(selection,target)?{kind:"replaceTextRange",data:{selection:target,text:input}}:{kind:"insertPlainText",text:input});return;
   }
   if(type.startsWith("delete")){
    const backward=type.includes("Backward"),boundary=boundaryDelete(this.#context(),backward);
    if(boundary){this.execute(boundary);return;}
    if(selection.anchor.block!==selection.focus.block||selection.anchor.offset!==selection.focus.offset){this.execute({kind:"deleteSelection"});return;}
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
  this.#boundary();
  this.#attempt(()=>{this.#sync();const transfer=this.#options.core.clipboard();if(!transfer)return;
   event.preventDefault();event.clipboardData!.setData("text/plain",transfer.plainText);event.clipboardData!.setData("application/x-breditor-rich+json",transfer.structuredJson);
   if(!event.clipboardData!.types.includes("text/plain")||event.clipboardData!.getData("text/plain")!==transfer.plainText)throw Error("Clipboard did not retain the supplied text; content was not cut");
   if(cut&&this.#model.view.readOnly!==true){const command=deleteSelection(this.#context());if(command)this.execute(command);}
  });
 }
 #paste(event:ClipboardEvent):void {
  if(this.#model.view.readOnly===true){event.preventDefault();return;}
  if(this.#composition||!event.clipboardData)return;event.preventDefault();
  this.#boundary();
  const files=[...event.clipboardData.files];if(files.length){this.#files(files);return;}
  this.#attempt(()=>{this.#sync();const clipboard=event.clipboardData!.getData("application/x-breditor-rich+json");
   if(clipboard){const kind=(JSON.parse(clipboard) as {kind:string}).kind,allocation={prefix:this.#allocate("paste"),...this.#context().stamp()};
    if(kind==="text")this.execute({kind:"pasteInlineClipboard",data:{clipboardJson:clipboard}});
    else if(kind==="grid"&&this.#model.view.selection?.kind==="grid")this.execute({kind:"pasteGridClipboard",data:{clipboardJson:clipboard,allocation}});
    else if(this.#model.view.selection?.kind==="text")this.execute({kind:"pasteFlowAtText",data:{clipboardJson:clipboard,allocation,right:this.#allocate("p")}});
    else this.execute({kind:"pasteFlowClipboard",data:{clipboardJson:clipboard,allocation,position:positionAfter(this.#context())}});
   }else this.execute({kind:"insertPlainText",text:event.clipboardData!.getData("text/plain")});
  });
 }
 #files(files:readonly File[]):void {if(this.#options.core.view().readOnly===true)return;this.#boundary();this.#attempt(()=>{this.#sync();if(!this.#options.onFiles)throw Error("Image file insertion requires an asset host");void Promise.resolve(this.#options.onFiles(files,positionAfter(this.#context()))).catch(error=>this.#report(error));});}
 #startComposition():void {if(this.#model.view.readOnly===true)return;this.#boundary();this.#attempt(()=>{this.#sync();const selection=this.#model.view.selection;if(selection?.kind!=="text"||selection.anchor.block!==selection.focus.block)return;const node=this.#model.nodes.get(selection.focus.block);if(node)this.#composition={block:id(node),original:text(node),revision:this.#model.view.revision,finishing:false};});}
 #endComposition():void {
  const composition=this.#composition;if(!composition)return;composition.finishing=true;
  this.surface.ownerDocument.defaultView?.requestAnimationFrame(()=>{
   if(this.#disposed||this.#composition!==composition)return;
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
   finally {for(const work of pending){try{this.execute(work.command,work.focus,work.revision);}catch(error){this.#report(error);}}this.#reconcile();}
  });
 }
 /** Unmount the surface and release its transferred exclusive core owner. */
 dispose():void {if(this.#disposed)return;this.#disposed=true;this.#abort.abort();this.#queue=[];this.#root.replaceChildren();delete this.#root.dataset["breditorRich"];this.#options.core.dispose();}
}
export function mountRichEditor(root:HTMLElement,options:RichEditorOptions):RichDomEditor{return new RichDomEditor(root,options);}
const styles=`[data-breditor-rich]{color:#173d37;font:16px system-ui,sans-serif;max-width:1100px;margin:auto}[data-breditor-rich] .breditor-rich-toolbar{display:flex;flex-wrap:wrap;align-items:end;gap:6px;padding:12px;background:#eef3ef;border:1px solid #bdcdc5;border-radius:10px 10px 0 0}[data-breditor-rich] button{padding:6px 9px;border:1px solid #aabbb3;border-radius:5px;background:white;color:inherit;cursor:pointer}[data-breditor-rich] button:disabled{opacity:.45;cursor:default}[data-breditor-rich] label{display:grid;font-size:12px;gap:3px}[data-breditor-rich] input{width:110px;padding:6px}[data-breditor-rich] .breditor-rich-surface{padding:20px;border:1px solid #bdcdc5;min-height:280px;outline:none;background:white}[data-breditor-rich] .breditor-rich-surface:focus{box-shadow:inset 0 0 0 2px #398a79}[data-breditor-rich] p,[data-breditor-rich] h1,[data-breditor-rich] h2,[data-breditor-rich] h3{white-space:pre-wrap}[data-breditor-rich] table{border-collapse:collapse;table-layout:fixed;margin:16px 0;max-width:100%}[data-breditor-rich] td,[data-breditor-rich] th{border:1px solid #91aaa0;padding:8px;vertical-align:top;min-width:80px}[data-breditor-rich] th{background:#eaf1ee}[data-breditor-rich] [data-select-cell]{font-size:10px;color:#527269;padding:2px 5px}[data-breditor-rich] [data-source-cell]+[data-source-cell]{border-top:1px dashed #b6c8c0}[data-breditor-rich] [data-selected]{box-shadow:inset 0 0 0 3px #398a79;background:#edf8f3}[data-breditor-rich] [data-node-selected]{outline:3px solid #398a79}[data-breditor-rich] figure{padding:12px;background:#f5f8f6;border:1px solid #d8e3dc;margin:16px 0}[data-breditor-rich] img{max-width:100%;object-fit:contain;display:block;min-width:40px;min-height:30px}[data-breditor-rich] figcaption{margin-top:8px;color:#527269}[data-breditor-rich] .breditor-rich-status{font-size:12px;color:#527269}`;
