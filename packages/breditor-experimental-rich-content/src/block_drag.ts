// Opt-in block drag handle shared by the local and shared rich editors through a small host port.
// DOM here is presentation only: every accepted drop or keyboard move is one guarded retained-ID
// move dispatched through the owner's queue, so the block ID moves (never copy/delete), Rust
// validates the complete group, and one dispatch is one native Undo step. Rejected or stale
// targets publish nothing.
import {id,presentationModel,type ElementNode,type RichPresentationModel} from "./model.js";
import {registerRichPresentationShortcut} from "./shortcut_registry.js";
import {defaultRichUi,type RichUiLocale,type RichUiStringKey} from "./ui_locale.js";
import type {RichDomEditor} from "./controller.js";
import type {RichSelectionPolicy} from "./core.js";
import {resolveRichBlockMove,resolveRichBlockStep,richBlockDropTargets,richHandleBlock,richSelectionBlock,type RichBlockDropTarget,type RichBlockMove,type RichBlockMovePolicy,type RichBlockMoveResolution,type RichBlockMoveRejection,type RichLocatedBlockDropTarget} from "./block_move.js";

export interface RichBlockDragOptions {
 /** Default `sibling-v1`; `flow-v1` additionally offers grammar-legal cross-container drops. */
 policy?:RichBlockMovePolicy;
 /** Accessible handle label; overrides the editor catalog's blockDragLabel. Announcements use the port's `uiLocale()`. */
 label?:string;
 /** Reserve Alt+Shift+ArrowUp/ArrowDown inside the editor to move the caret's block (default true). On macOS
  * this replaces the native Option+Shift+Up/Down "extend selection to paragraph" shortcut; pass false to keep
  * it. The same keys on the focused handle always work. */
 editorShortcut?:boolean;
 /** Called after Rust accepted one move publication. */
 onMove?:(event:{block:string;parent:string|null;before:string|null;source:"pointer"|"keyboard"})=>void;
 /** Called when a pointer drop or keyboard request is refused before or by native admission. */
 onReject?:(event:{block:string;reason:RichBlockMoveRejection|"native"})=>void;
}
export interface RichBlockDrag {
 readonly layer:HTMLDivElement;readonly handle:HTMLButtonElement;readonly indicator:HTMLDivElement;
 /** Block currently owning the handle, or null when hidden. */
 activeBlock():string|null;
 /** Programmatic equivalent of a drop. Returns true when Rust accepted one move. */
 move(block:string,target:RichBlockDropTarget):boolean;
 /** Programmatic equivalent of Alt+Shift+ArrowUp/ArrowDown. */
 step(block:string,direction:-1|1):boolean;
 dispose():void;
}
/** Host port: the minimum an editor owner must offer the drag handle. */
export interface RichBlockDragPort {
 /** Rendered editable surface carrying `[data-rich-block]` elements. */
 readonly surface:HTMLElement;
 /** The handle layer is inserted immediately before this element (normally the status line). */
 readonly anchor:HTMLElement;
 /** Presentation model of the current publication (cache it by revision). */
 model():RichPresentationModel;
 /** Current publication revision, read again after a dispatch. */
 revision():string;
 /** Moves are refused rather than queued while closed, busy or composing. */
 state():{readonly closed:boolean;readonly busy:boolean;readonly composing:boolean};
 /** Close an open natural-typing group so a move never merges into typed text. */
 closeTypingGroup():void;
 /** Publish exactly one guarded move; throw when the owner refuses it. */
 dispatch(move:RichBlockMove,focus:boolean,revision:string):void;
 focus():void;
 /** Editor UI locale for labels and announcements; English when absent. */
 uiLocale?():RichUiLocale;
}

const MESSAGES:Readonly<Record<RichBlockMoveRejection|"native",RichUiStringKey>>={
 read_only:"blockDragReadOnly",unknown_block:"blockDragUnknownBlock",not_movable:"blockDragNotMovable",
 invalid_target:"blockDragInvalidTarget",cyclic:"blockDragCyclic",cross_container:"blockDragCrossContainer",
 grammar:"blockDragGrammar",empties_source:"blockDragEmptiesSource",item_lead:"blockDragItemLead",
 boundary:"blockDragBoundary",native:"blockDragNative",
};
/** Content direction of a rendered block (its block-direction or inherited), never the chrome direction. */
function blockIsRtl(element:HTMLElement):boolean{try{return element.ownerDocument.defaultView?.getComputedStyle(element).direction==="rtl";}catch{return false;}}
export const richBlockDragStyles=`.breditor-block-drag-handle{position:fixed;z-index:20;display:inline-flex;align-items:center;justify-content:center;width:20px;height:22px;padding:0;border:0;border-radius:4px;background:transparent;color:#6b7280;cursor:grab;touch-action:none;user-select:none;font:14px/1 system-ui}.breditor-block-drag-handle:hover,.breditor-block-drag-handle:focus-visible,.breditor-block-drag-handle[aria-pressed=true]{background:#e5e7eb;color:#111827}.breditor-block-drag-handle[hidden]{display:none}.breditor-block-drag[data-dragging] .breditor-block-drag-handle{cursor:grabbing;pointer-events:none}.breditor-block-drop-indicator{position:fixed;z-index:19;height:0;border-top:2px solid var(--breditor-drop-color,#2563eb);pointer-events:none}.breditor-block-drop-indicator[data-state=invalid]{border-top-style:dashed;border-color:var(--breditor-drop-invalid-color,#dc2626)}.breditor-block-drop-indicator[hidden]{display:none}.breditor-block-drag-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}`;

interface Hit {resolution:RichBlockMoveResolution;target:RichBlockDropTarget|null;element:HTMLElement|null}

/** Mount the handle on any owner through its port. Prefer `mountRichBlockDrag` for `RichDomEditor`. */
export function mountRichBlockDragPort(port:RichBlockDragPort,options:RichBlockDragOptions={}):RichBlockDrag{
 const policy=options.policy??"sibling-v1";if(policy!=="sibling-v1"&&policy!=="flow-v1")throw new TypeError("Expected block move policy sibling-v1 or flow-v1");
 const surface=port.surface,d=surface.ownerDocument,win=d.defaultView!,abort=new AbortController(),signal=abort.signal;
 const ui=port.uiLocale?.()??defaultRichUi,layer=d.createElement("div");layer.className="breditor-block-drag";ui.applyChrome(layer);
 const style=d.createElement("style");style.textContent=richBlockDragStyles;
 const handle=d.createElement("button");handle.type="button";handle.className="breditor-block-drag-handle";handle.textContent="⋮⋮";handle.hidden=true;handle.draggable=false;
 handle.setAttribute("aria-label",options.label??ui.text("blockDragLabel"));handle.setAttribute("aria-pressed","false");
 const help=d.createElement("span");help.className="breditor-block-drag-live";help.id=`breditor-block-drag-help-${Math.random().toString(36).slice(2)}`;
 help.textContent=ui.text("blockDragHelp");
 handle.setAttribute("aria-describedby",help.id);
 const indicator=d.createElement("div");indicator.className="breditor-block-drop-indicator";indicator.hidden=true;indicator.setAttribute("aria-hidden","true");
 const live=d.createElement("p");live.className="breditor-block-drag-live";live.setAttribute("role","status");live.setAttribute("aria-live","polite");
 layer.append(style,handle,help,indicator,live);port.anchor.before(layer);

 let active:string|null=null,disposed=false;
 let drag:{block:string;pointer:number;hit:Hit|null}|undefined,mode:{block:string;targets:readonly RichLocatedBlockDropTarget[];index:number}|undefined;
 const model=():RichPresentationModel=>port.model();
 const elementFor=(block:string):HTMLElement|null=>{for(const element of surface.querySelectorAll<HTMLElement>("[data-rich-block]"))if(element.dataset["richBlock"]===block)return element;return null;};
 const announce=(message:string):void=>{live.textContent=message;};
 const readOnly=():boolean=>model().view.readOnly===true;

 function place():void{
  if(disposed)return;const element=active&&!readOnly()?elementFor(active):null;
  if(!element){if(!mode&&!drag){handle.hidden=true;active=null;}return;}
  const rect=element.getBoundingClientRect();handle.hidden=false;handle.style.top=`${rect.top}px`;handle.style.left=`${blockIsRtl(element)?rect.right+4:Math.max(0,rect.left-24)}px`;
  if(mode)showTarget(mode.targets[mode.index]);
 }
 function setActive(block:string|null):void{if(drag||mode)return;active=block;place();}
 function hideIndicator():void{indicator.hidden=true;delete indicator.dataset["state"];delete layer.dataset["dropRejected"];}
 function showLine(element:HTMLElement,side:"before"|"after",valid:boolean):void{
  const rect=element.getBoundingClientRect();indicator.hidden=false;indicator.dataset["state"]=valid?"valid":"invalid";
  indicator.style.top=`${(side==="before"?rect.top:rect.bottom)-1}px`;indicator.style.left=`${rect.left}px`;indicator.style.width=`${rect.width}px`;
 }
 function showTarget(target:RichLocatedBlockDropTarget|undefined):void{const element=target&&elementFor(target.anchor);if(!target||!element){hideIndicator();return;}delete layer.dataset["dropRejected"];showLine(element,target.side,true);}

 /** Deepest-first semantic resolution: climb rendered blocks under the pointer until one admits the drop. */
 function hitAt(block:string,x:number,y:number):Hit|null{
  const under=d.elementFromPoint?.(x,y);if(!under||!surface.contains(under))return null;
  const value=model();let first:Hit|null=null;
  for(let element=(under as Element).closest<HTMLElement>("[data-rich-block]");element&&surface.contains(element);element=element.parentElement?.closest<HTMLElement>("[data-rich-block]")??null){
   const anchor=element.dataset["richBlock"]!,rect=element.getBoundingClientRect(),side=y<rect.top+rect.height/2?"before":"after";
   const target={anchor,side} as const,resolution=resolveRichBlockMove(value,block,target,policy),hit={resolution,target,element};
   if(resolution.kind!=="rejected")return hit;first??=hit;
  }
  return first;
 }
 function reject(block:string,reason:RichBlockMoveRejection|"native"):false{announce(ui.text(MESSAGES[reason]));try{options.onReject?.({block,reason});}catch{/* host callback cannot rewind */}return false;}
 /** Close an open typing group first, then plan against the fresh publication and dispatch with its
  * exact revision: a stale plan is refused by the native guard and nothing is published. */
 function plan(block:string,produce:(value:RichPresentationModel)=>RichBlockMoveResolution,source:"pointer"|"keyboard",focus:boolean):boolean{
  if(disposed)return false;
  // While the editor is busy or composing, a dispatch only queues; that queued move would be refused as
  // stale once the current work publishes. Refuse it now rather than report a move that never happens.
  const state=port.state();if(state.closed||state.busy||state.composing)return reject(block,"native");
  try{port.closeTypingGroup();}catch{return reject(block,"native");}
  const value=model(),resolution=produce(value);
  if(resolution.kind==="unchanged"){announce(ui.text("blockDragUnchanged"));return false;}
  if(resolution.kind==="rejected")return reject(block,resolution.reason);
  try{port.dispatch(resolution.move,focus,value.view.revision);}catch{return reject(block,"native");}
  if(port.revision()===value.view.revision)return reject(block,"native");
  announce(ui.text("blockDragMoved"));
  try{options.onMove?.({block,parent:resolution.parent,before:resolution.before,source});}catch{/* host callback cannot rewind */}
  return true;
 }

 // Hover/focus ownership of the single floating handle.
 surface.addEventListener("pointermove",event=>{if(drag||mode)return;const element=(event.target as Element|null)?.closest?.<HTMLElement>("[data-rich-block]");const block=element?.dataset["richBlock"];setActive(block?richHandleBlock(model(),block):null);},{signal});
 surface.addEventListener("focusin",()=>{if(!handle.matches(":hover"))setActive(richSelectionBlock(model()));},{signal});
 handle.addEventListener("focus",()=>{if(!active)setActive(richSelectionBlock(model()));},{signal});
 handle.addEventListener("blur",()=>{if(mode)cancelMode(ui.text("blockDragCancelled"));},{signal});

 // Pointer drag.
 handle.addEventListener("pointerdown",event=>{
  if(event.button!==0||!active||readOnly()||mode)return;event.preventDefault();
  drag={block:active,pointer:event.pointerId,hit:null};layer.dataset["dragging"]="";announce(ui.text("blockDragDragging"));
 },{signal});
 win.addEventListener("pointermove",event=>{
  if(!drag||event.pointerId!==drag.pointer)return;event.preventDefault();
  const hit=hitAt(drag.block,event.clientX,event.clientY);drag.hit=hit;
  if(!hit?.element||!hit.target||hit.resolution.kind==="unchanged"){hideIndicator();return;}
  showLine(hit.element,hit.target.side,hit.resolution.kind==="move");
  if(hit.resolution.kind==="rejected")layer.dataset["dropRejected"]=hit.resolution.reason;else delete layer.dataset["dropRejected"];
 },{signal});
 const endDrag=(drop:boolean):void=>{
  if(!drag)return;const {block,hit}=drag;drag=undefined;delete layer.dataset["dragging"];hideIndicator();
  if(!drop){announce(ui.text("blockDragCancelled"));return;}
  if(!hit){reject(block,"invalid_target");return;}
  const target=hit.target!;plan(block,value=>resolveRichBlockMove(value,block,target,policy),"pointer",true);place();
 };
 win.addEventListener("pointerup",event=>{if(drag&&event.pointerId===drag.pointer)endDrag(true);},{signal});
 win.addEventListener("pointercancel",event=>{if(drag&&event.pointerId===drag.pointer)endDrag(false);},{signal});
 win.addEventListener("keydown",event=>{if(drag&&event.key==="Escape"){event.preventDefault();endDrag(false);}},{signal,capture:true});

 // Keyboard move mode on the focused handle.
 const order=():{pre:Map<string,number>;end:Map<string,number>}=>{const pre=new Map<string,number>(),end=new Map<string,number>();let n=0;const walk=(node:ElementNode):void=>{for(const child of node.children){if(child.kind!=="element")continue;const key=id(child);pre.set(key,n++);walk(child);end.set(key,n-1);}};walk(model().root);return {pre,end};};
 function startMode():void{
  const block=active;if(!block||readOnly())return;const targets=richBlockDropTargets(model(),block,policy);
  if(!targets.length){announce(ui.text("blockDragNoTargets"));return;}
  mode={block,targets,index:-1};handle.setAttribute("aria-pressed","true");announce(ui.text("blockDragPickedUp",{count:targets.length}));
 }
 function cancelMode(message:string):void{if(!mode)return;mode=undefined;handle.setAttribute("aria-pressed","false");hideIndicator();announce(message);}
 function cycle(direction:-1|1|"first"|"last"):void{
  if(!mode)return;const count=mode.targets.length;
  if(direction==="first")mode.index=0;else if(direction==="last")mode.index=count-1;
  else if(mode.index<0){const {pre,end}=order(),at=pre.get(mode.block)!,tail=end.get(mode.block)!;const key=(t:RichLocatedBlockDropTarget):number=>t.side==="before"?pre.get(t.anchor)!-0.5:end.get(t.anchor)!+0.5;
   if(direction<0){let found=-1;mode.targets.forEach((t,i)=>{if(key(t)<at)found=i;});mode.index=found<0?0:found;}
   else{const found=mode.targets.findIndex(t=>key(t)>tail);mode.index=found<0?count-1:found;}}
  else mode.index=Math.min(count-1,Math.max(0,mode.index+direction));
  showTarget(mode.targets[mode.index]);announce(ui.text("blockDragPosition",{index:mode.index+1,count}));
 }
 handle.addEventListener("keydown",event=>{
  if(event.isComposing)return;const k=event.key;
  if(mode){
   if(k==="Escape"){event.preventDefault();cancelMode(ui.text("blockDragCancelled"));return;}
   if(k==="ArrowUp"||k==="ArrowLeft"){event.preventDefault();cycle(-1);return;}
   if(k==="ArrowDown"||k==="ArrowRight"){event.preventDefault();cycle(1);return;}
   if(k==="Home"||k==="End"){event.preventDefault();cycle(k==="Home"?"first":"last");return;}
   if(k==="Enter"||k===" "){event.preventDefault();const {block,targets,index}=mode;const target=targets[index];mode=undefined;handle.setAttribute("aria-pressed","false");hideIndicator();
    if(!target){announce(ui.text("blockDragCancelled"));return;}plan(block,value=>resolveRichBlockMove(value,block,target,policy),"keyboard",false);place();return;}
   return;
  }
  if(event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&(k==="ArrowUp"||k==="ArrowDown")){event.preventDefault();if(active){plan(active,value=>resolveRichBlockStep(value,active!,k==="ArrowUp"?-1:1),"keyboard",false);place();}return;}
  if(k==="Enter"||k===" "){event.preventDefault();startMode();return;}
  if(k==="Escape"){event.preventDefault();port.focus();}
 },{signal});
 // Reserved editor shortcut: Alt+Shift+ArrowUp/ArrowDown moves the caret's block one sibling slot.
 layer.parentElement!.addEventListener("keydown",event=>{
  if(options.editorShortcut===false||event.isComposing||!(event.target instanceof Node)||!surface.contains(event.target))return;
  if(!event.altKey||!event.shiftKey||event.ctrlKey||event.metaKey||(event.key!=="ArrowUp"&&event.key!=="ArrowDown"))return;
  event.preventDefault();event.stopPropagation();
  const block=richSelectionBlock(model());if(!block){announce(ui.text(MESSAGES.not_movable));return;}
  plan(block,value=>resolveRichBlockStep(value,block,event.key==="ArrowUp"?-1:1),"keyboard",true);setActive(block);
 },{signal,capture:true});

 const releaseShortcut=options.editorShortcut===false?()=>{}:registerRichPresentationShortcut(surface,{id:"ui:block-move-up",group:"blocks",label:ui.text("shortcutMoveBlockUp"),keys:[{key:"ArrowUp",alt:true,shift:true}]}),
  releaseShortcutDown=options.editorShortcut===false?()=>{}:registerRichPresentationShortcut(surface,{id:"ui:block-move-down",group:"blocks",label:ui.text("shortcutMoveBlockDown"),keys:[{key:"ArrowDown",alt:true,shift:true}]});
 const observer=new win.MutationObserver(()=>place());observer.observe(surface,{childList:true,subtree:true,characterData:true});
 win.addEventListener("scroll",()=>place(),{signal,capture:true,passive:true});win.addEventListener("resize",()=>place(),{signal});

 return {layer,handle,indicator,
  activeBlock:()=>active,
  move:(block,target)=>plan(block,value=>resolveRichBlockMove(value,block,target,policy),"keyboard",false),
  step:(block,direction)=>plan(block,value=>resolveRichBlockStep(value,block,direction),"keyboard",false),
  dispose(){if(disposed)return;disposed=true;drag=undefined;mode=undefined;abort.abort();observer.disconnect();layer.remove();releaseShortcut();releaseShortcutDown();},
 };
}

/** Opt-in block drag handle for the local `RichDomEditor`: each accepted move is one guarded
 * `{kind:"moveBlock"}` command and one native Undo step. Editors that do not call this are unchanged. */
export function mountRichBlockDrag<P extends RichSelectionPolicy>(editor:RichDomEditor<P>,options:RichBlockDragOptions={}):RichBlockDrag{
 let cached:{revision:string;model:RichPresentationModel}|undefined;
 return mountRichBlockDragPort({
  surface:editor.surface,anchor:editor.status,
  model(){const view=editor.view();if(cached?.revision!==view.revision){const family=(view.format==="breditor/rich-document-view"?"document-v1":"original") as P;cached={revision:view.revision,model:presentationModel<P>(view,family)};}return cached.model;},
  revision:()=>editor.view().revision,
  state:()=>editor.contextUiState(),
  closeTypingGroup(){if(editor.view().historyGrouping==="typing-v1")editor.closeTypingGroup();},
  dispatch(move,focus,revision){editor.execute({kind:"moveBlock",data:{block:move.block,parent:move.parent,before:move.before}},focus,revision);},
  focus:()=>editor.focus(),
  uiLocale:()=>editor.uiLocale(),
 },options);
}
