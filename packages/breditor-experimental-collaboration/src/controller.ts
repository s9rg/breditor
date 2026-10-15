import {model,id,text,sourceCell,render,paintSelection,readNative,readTarget,restoreNative,type RichModel,type RichView,type RenderOptions} from "@breditor/experimental-rich-content/rendering";
import {SharedRichEditor,SharedEditorError} from "./core.js";
import {bold,boundaryDelete,caret,cellBlock,enter,positionAfter,removeSelection,type ActionContext,type SharedToolbarControl} from "./actions.js";
import {defaultSharedToolbar,moveSharedToolbar} from "./toolbar.js";
import type {SharedDispatch,SharedPublication,RichSelection,Navigation} from "./types.js";
export interface SharedDomOptions extends RenderOptions {
 core:SharedRichEditor;toolbar?:readonly SharedToolbarControl[];label?:string;image?:{asset:string;alt:string};
 onChange?:(event:SharedPublication)=>void|Promise<void>;onError?:(error:unknown)=>void;
 onFiles?:(files:readonly File[],position:{parent:string|null;before:string|null},revision:string)=>void|Promise<void>;
}
interface Work {run:(context:ActionContext)=>void;revision:string;focus:boolean}
interface Composition {block:string;original:string;revision:string;release:()=>void}
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
 #disposed=false;#busy=false;#logical=false;#queue:Work[]=[];#composition:Composition|undefined;
 #prefix=`shared:${crypto.randomUUID()}`;#counter=0n;#controls:{control:SharedToolbarControl;button:HTMLButtonElement;input?:HTMLInputElement}[]=[];
 constructor(root:HTMLElement,options:SharedDomOptions){
  this.#root=root;this.#options=options;this.#model=this.#read();this.#logical=this.#model.view.selection?.kind==="grid"||this.#model.view.selection?.kind==="node";
  const d=root.ownerDocument,style=d.createElement("style");style.textContent=styles;root.dataset["breditorShared"]="";
  this.surface=d.createElement("div");this.surface.contentEditable="true";this.surface.className="breditor-shared-surface";this.surface.setAttribute("role","textbox");this.surface.setAttribute("aria-multiline","true");this.surface.setAttribute("aria-label",options.label??"Shared rich text editor");
  this.toolbar=d.createElement("div");this.toolbar.className="breditor-shared-toolbar";this.toolbar.setAttribute("role","toolbar");this.toolbar.setAttribute("aria-label","Shared rich text controls");this.status=d.createElement("p");this.status.setAttribute("role","status");
  const seen=new Set<string>();for(const control of options.toolbar??[...defaultSharedToolbar,...moveSharedToolbar]){
   if(seen.has(control.id))throw Error("Duplicate shared toolbar control");seen.add(control.id);const button=d.createElement("button");button.type="button";button.textContent=control.type?`Apply ${control.label}`:control.label;button.dataset["sharedAction"]=control.id;
   let input:HTMLInputElement|undefined;if(control.type){const label=d.createElement("label");label.textContent=control.label;input=d.createElement("input");input.type=control.type;input.dataset["sharedField"]=control.id;input.setAttribute("aria-label",control.label);label.append(input);this.toolbar.append(label);}
   button.addEventListener("pointerdown",event=>this.#attempt(()=>{if(!input)event.preventDefault();this.#sync();}),{signal:this.#abort.signal});button.addEventListener("click",()=>this.#attempt(()=>this.#perform(c=>control.run(c,input?.value))),{signal:this.#abort.signal});
   this.toolbar.append(button);this.#controls.push(input?{control,button,input}:{control,button});
  }
  root.replaceChildren(style,this.toolbar,this.surface,this.status);render(this.surface,this.#model,options);this.#refreshControls();
  this.#unsubscribe=options.core.subscribe(event=>{if(!this.#busy&&!this.#composition)this.#refresh(false);try{void Promise.resolve(options.onChange?.(event)).catch(error=>this.#report(error));}catch(error){this.#report(error);}});
  const signal=this.#abort.signal;
  this.surface.addEventListener("beforeinput",event=>this.#input(event as InputEvent),{signal});
  this.surface.addEventListener("input",()=>{if(!this.#composition)this.#refresh(false);},{signal});
  this.surface.addEventListener("keydown",event=>this.#key(event),{signal});
  this.surface.addEventListener("pointerdown",event=>this.#pick(event),{signal});
  this.surface.addEventListener("copy",event=>this.#copy(event,false),{signal});this.surface.addEventListener("cut",event=>this.#copy(event,true),{signal});this.surface.addEventListener("paste",event=>this.#paste(event),{signal});
  this.surface.addEventListener("dragover",event=>{if(event.dataTransfer?.types.includes("Files"))event.preventDefault();},{signal});this.surface.addEventListener("drop",event=>{if(event.dataTransfer?.files.length){event.preventDefault();this.#files([...event.dataTransfer.files]);}},{signal});
  this.surface.addEventListener("compositionstart",()=>this.#startComposition(),{signal});this.surface.addEventListener("compositionend",()=>this.#endComposition(),{signal});
  d.addEventListener("selectionchange",()=>{if(!this.#busy&&!this.#composition)this.#attempt(()=>this.#sync());},{signal});
 }
 #read():RichModel{const view=this.#options.core.view();return model({...view,format:"breditor/rich-view"} satisfies RichView);}
 #live():void{if(this.#disposed)throw new SharedEditorError("disposed","The shared DOM editor is disposed");}
 #allocate=(kind:string):string=>`${this.#prefix}:${kind}:${this.#counter++}`;
 #context():ActionContext{const value:ActionContext={core:this.#options.core,model:this.#model,revision:this.#model.view.revision,allocate:this.#allocate};if(this.#options.image)value.image=this.#options.image;return value;}
 #report(error:unknown):void{if(this.#disposed)return;this.status.textContent=error instanceof Error?error.message:String(error);try{this.#options.onError?.(error);}catch{/* A callback cannot rewind committed state. */}}
 #attempt(run:()=>void):void{try{run();}catch(error){this.#report(error);this.#refresh(false);}}
 #refreshControls():void{const context=this.#context();for(const {control,button,input}of this.#controls){const enabled=control.enabled(context);button.disabled=!enabled;if(input){input.disabled=!enabled;if(input!==input.ownerDocument.activeElement)input.value=enabled?control.value?.(context)??"":"";}}}
 #refresh(focus:boolean):void{
  if(this.#disposed||this.#composition)return;const previous=this.#model.view.documentJson,active=this.surface.ownerDocument.activeElement,ownedFocus=active===this.surface||!!active&&this.surface.contains(active);
  this.#model=this.#read();this.#logical=this.#model.view.selection?.kind==="grid"||this.#model.view.selection?.kind==="node";
  if(previous!==this.#model.view.documentJson)render(this.surface,this.#model,this.#options);else paintSelection(this.surface,this.#model);
  if(focus||ownedFocus){this.surface.focus({preventScroll:true});restoreNative(this.surface,this.#model.view.selection);}this.#refreshControls();
  this.status.textContent=`Shared revision ${this.#model.view.revision} · ${this.#model.view.undoDepth} undo · ${this.#options.core.pendingRemote().frames} pending remote`;
 }
 #sync():void{if(this.#busy||this.#composition||this.#logical)return;const selection=readNative(this.surface,this.#model);if(selection&&!sameSelection(selection,this.#model.view.selection))this.#perform(c=>{c.core.select(selection,c.revision);},false);}
 #perform(run:(context:ActionContext)=>void,focus=true,revision=this.#model.view.revision):void{
  this.#live();if(this.#queue.length>=128)throw Error("Shared editor command queue is full");this.#queue.push({run,focus,revision});if(this.#busy||this.#composition)return;
  const release=this.#options.core.holdRemotes();this.#busy=true;let error:unknown,drained=0;
  try{while(!this.#disposed&&this.#queue.length){if(++drained>128){this.#queue=[];throw Error("Shared editor callback command loop exceeded its bound");}const next=this.#queue.shift()!;
   try{if(next.revision!==this.#options.core.view().revision)throw new SharedEditorError("stale_observation","Queued work was prepared from an older publication");next.run(this.#context());this.#refresh(next.focus);}catch(e){error??=e;this.#report(e);this.#refresh(false);}
  }}finally{this.#busy=false;release();}if(error!==undefined)throw error;
 }
 execute(request:SharedDispatch,focus=true,revision=this.#model.view.revision):void{const frozen=JSON.parse(JSON.stringify(request)) as SharedDispatch;this.#perform(c=>{c.core.dispatch(frozen,c.revision);},focus,revision);}
 select(selection:RichSelection|null,focus=true):void{const frozen=structuredClone(selection);this.#perform(c=>{c.core.select(frozen,c.revision);},focus);}
 view():ReturnType<SharedRichEditor["view"]>{this.#live();return this.#options.core.view();}
 checkpointJson():string{this.#live();return this.#options.core.checkpointJson();}
 focus():void{this.#live();this.surface.focus();restoreNative(this.surface,this.#model.view.selection);}
 #pick(event:PointerEvent):void{const target=event.target as Element,cell=target.closest<HTMLElement>("[data-select-cell]"),node=target.closest<HTMLElement>("[data-select-node]"),figure=target.closest<HTMLElement>("[data-rich-image]");
  if(cell){event.preventDefault();const focus=JSON.parse(cell.dataset["selectCell"]!) as Extract<RichSelection,{kind:"grid"}>["focus"],prior=this.#model.view.selection,anchor=event.shiftKey&&prior?.kind==="grid"&&prior.anchor.table===focus.table?prior.anchor:focus;this.#attempt(()=>this.select({kind:"grid",anchor,focus}));}
  else if(node||(figure&&!target.closest("[data-rich-text]"))){event.preventDefault();const block=node?.dataset["selectNode"]??figure?.dataset["richBlock"];if(block)this.#attempt(()=>this.select({kind:"node",block}));}else this.#logical=false;
 }
 #key(event:KeyboardEvent):void{if(this.#composition||event.isComposing)return;const mod=event.metaKey||event.ctrlKey,key=event.key.toLowerCase();if(mod&&key==="a")this.#logical=false;
  if(mod&&["z","y","b"].includes(key)){event.preventDefault();this.#attempt(()=>{this.#sync();this.#perform(c=>{if(key==="b")bold(c);else if(key==="y"||event.shiftKey)c.core.redo(c.revision);else c.core.undo(c.revision);});});return;}
  const s=this.#model.view.selection;if(s?.kind==="grid"){
   const moves:Record<string,Navigation>={ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down",Tab:event.shiftKey?"previous":"next",Home:mod?"tableStart":"rowStart",End:mod?"tableEnd":"rowEnd"},move=moves[event.key];
   if(move){this.#attempt(()=>this.#perform(c=>{const result=c.core.navigate(move,event.key!=="Tab"&&event.shiftKey,c.revision);if(event.key!=="Tab"||result.kind!=="boundary")event.preventDefault();}));return;}
   if(event.key==="Enter"||event.key==="Escape"){event.preventDefault();const block=this.#model.textBlocks.find(n=>{const cell=sourceCell(this.#model,id(n));return cell?.table===s.focus.table&&cell.row===s.focus.row&&cell.column===s.focus.column;});if(block)this.select(caret(id(block)));return;}
  }
  if((s?.kind==="node"||s?.kind==="grid")&&(event.key==="Backspace"||event.key==="Delete")){event.preventDefault();this.#attempt(()=>this.#perform(removeSelection));}
 }
 #input(event:InputEvent):void{if(this.#composition||event.isComposing)return;event.preventDefault();this.#attempt(()=>{this.#sync();const kind=event.inputType;
  this.#perform(c=>{if(kind==="historyUndo"){c.core.undo(c.revision);return;}if(kind==="historyRedo"){c.core.redo(c.revision);return;}if(kind==="formatBold"){bold(c);return;}if(kind==="insertParagraph"){enter(c);return;}
   const s=c.model.view.selection;if(s?.kind!=="text")return;const range=event.getTargetRanges?.()[0],target=range?readTarget(this.surface,range):null;
   if(kind==="insertText"||kind==="insertReplacementText"||kind==="insertLineBreak"){const value=kind==="insertLineBreak"?"\n":event.data??"";if(target)c.core.replace(target,value,c.revision);else c.core.type(value,c.revision);return;}
   if(kind.startsWith("delete")){const backward=kind.includes("Backward");if(boundaryDelete(c,backward))return;if(s.anchor.block!==s.focus.block||s.anchor.offset!==s.focus.offset){c.core.replace(s,"",c.revision);return;}if(target&&(target.anchor.block!==target.focus.block||target.anchor.offset!==target.focus.offset)){c.core.replace(target,"",c.revision);return;}
    const n=c.model.nodes.get(s.focus.block);if(!n)return;const content=text(n),offset=Number(s.focus.offset),segments=[...new Intl.Segmenter(undefined,{granularity:kind.includes("Word")?"word":"grapheme"}).segment(content)],start=backward?segments.filter(v=>v.index<offset).at(-1)?.index??0:offset,end=backward?offset:segments.find(v=>v.index>offset)?.index??content.length;
    c.core.replace({kind:"text",anchor:{...s.focus,offset:String(start)},focus:{...s.focus,offset:String(end)}},"",c.revision);
   }
  });
 });}
 #copy(event:ClipboardEvent,cut:boolean):void{if(!event.clipboardData)return;if(this.#composition||this.#busy){event.preventDefault();return;}this.#attempt(()=>{this.#sync();this.#perform(c=>{const content=c.core.copy();if(!content)return;event.preventDefault();event.clipboardData!.setData("text/plain",content.plainText);event.clipboardData!.setData("application/x-breditor-rich+json",content.richJson);if(!event.clipboardData!.types.includes("text/plain")||event.clipboardData!.getData("text/plain")!==content.plainText)throw Error("Clipboard did not retain text; content was not cut");if(cut)removeSelection(c);},false);});}
 #paste(event:ClipboardEvent):void{if(!event.clipboardData)return;event.preventDefault();if(this.#composition||this.#busy)return;
  this.#attempt(()=>{const transfer=event.clipboardData!,files=[...transfer.files];if(files.length){this.#files(files);return;}
   // Clipboard stores are event-scoped. Capture strings before preparing/queuing work,
   // and never interpret an empty or unsupported transfer as a selection deletion.
   const fragment=transfer.getData("application/x-breditor-rich+json"),plain=transfer.getData("text/plain");if(!fragment&&!plain)return;
   this.#sync();this.#perform(c=>{if(!fragment){c.core.type(plain,c.revision);return;}const kind=(JSON.parse(fragment) as {kind:string}).kind,s=c.model.view.selection,prefix=c.allocate("paste");if(kind==="text")c.core.paste(fragment,{kind:"text"},prefix,c.revision);else if(kind==="grid"&&s?.kind==="grid")c.core.paste(fragment,{kind:"grid"},prefix,c.revision);else if(s?.kind==="text")c.core.pasteAtText(fragment,c.allocate("right"),prefix,c.revision);else c.core.paste(fragment,{kind:"flow",...positionAfter(c)},prefix,c.revision);});});
 }
 #files(files:readonly File[]):void{this.#attempt(()=>{this.#sync();if(!this.#options.onFiles)throw Error("Image files require an asset host");const position=positionAfter(this.#context()),revision=this.#model.view.revision;void Promise.resolve(this.#options.onFiles(files,position,revision)).catch(error=>this.#report(error));});}
 #startComposition():void{this.#attempt(()=>{this.#sync();const s=this.#model.view.selection;if(s?.kind!=="text"||s.anchor.block!==s.focus.block)return;const n=this.#model.nodes.get(s.focus.block);if(n)this.#composition={block:id(n),original:text(n),revision:this.#model.view.revision,release:this.#options.core.holdRemotes()};});}
 #endComposition():void{const composition=this.#composition;if(!composition)return;this.surface.ownerDocument.defaultView?.requestAnimationFrame(()=>{
  if(this.#disposed||this.#composition!==composition)return;const node=[...this.surface.querySelectorAll<HTMLElement>("[data-rich-text]")].find(n=>n.dataset["richText"]===composition.block),final=node?.textContent??composition.original;let start=0;while(start<composition.original.length&&start<final.length&&composition.original[start]===final[start])start++;if(start>0&&/[\uDC00-\uDFFF]/.test(composition.original[start]??final[start]??""))start--;
  let oldEnd=composition.original.length,newEnd=final.length;while(oldEnd>start&&newEnd>start&&composition.original[oldEnd-1]===final[newEnd-1]){oldEnd--;newEnd--;}if(oldEnd<composition.original.length&&/[\uDC00-\uDFFF]/.test(composition.original[oldEnd]??"")){oldEnd++;newEnd++;}
  this.#composition=undefined;const pending=this.#queue;this.#queue=[];
  try{if(composition.original!==final){const point={block:composition.block,affinity:"after" as const};this.#perform(c=>{c.core.replace({kind:"text",anchor:{...point,offset:String(start)},focus:{...point,offset:String(oldEnd)}},final.slice(start,newEnd),c.revision);},true,composition.revision);}}
  catch(error){this.#report(error);}finally{for(const work of pending)this.#attempt(()=>this.#perform(work.run,work.focus,work.revision));this.#refresh(false);composition.release();}
 });}
 dispose():void{if(this.#disposed)return;this.#disposed=true;this.#unsubscribe();this.#abort.abort();this.#queue=[];this.#options.core.dispose();this.#composition?.release();this.#composition=undefined;this.#root.replaceChildren();delete this.#root.dataset["breditorShared"];}
}
export const mountSharedEditor=(root:HTMLElement,options:SharedDomOptions):SharedDomEditor=>new SharedDomEditor(root,options);
const styles=`[data-breditor-shared]{color:#173d37;font:15px system-ui,sans-serif}[data-breditor-shared] .breditor-shared-toolbar{display:flex;gap:5px;flex-wrap:wrap;align-items:end;background:#edf2ef;padding:10px;border:1px solid #b6c7bf}[data-breditor-shared] button{padding:5px 8px;background:white;border:1px solid #a5b9af;border-radius:4px;color:inherit}[data-breditor-shared] button:disabled{opacity:.4}[data-breditor-shared] label{display:grid;font-size:11px;gap:3px}[data-breditor-shared] input{width:100px;padding:5px}[data-breditor-shared] .breditor-shared-surface{min-height:220px;padding:18px;border:1px solid #b6c7bf;background:white;outline:none;white-space:pre-wrap}[data-breditor-shared] .breditor-shared-surface:focus{box-shadow:inset 0 0 0 2px #378a77}[data-breditor-shared] p{min-height:1em}[data-breditor-shared] table{border-collapse:collapse;margin:10px 0;table-layout:fixed}[data-breditor-shared] td,[data-breditor-shared] th{border:1px solid #819e90;min-width:90px;padding:8px;vertical-align:top}[data-breditor-shared] [data-selected]{background:#e0f4e9}[data-breditor-shared] [data-node-selected]{outline:2px solid #378a77}[data-breditor-shared] figure{margin:10px 0;border:1px solid #a5b9af;padding:10px}[data-breditor-shared] img{max-width:100%;display:block}[data-breditor-shared] [data-source-cell]+[data-source-cell]{border-top:1px dashed #a5b9af}`;
