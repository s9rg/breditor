// Opt-in block drag handle for SharedDomEditor. DOM here is presentation only: every accepted drop
// or keyboard move is one guarded `move_block` dispatch through the editor queue, so the retained
// block ID moves (never copy/delete), Rust validates the complete group, and one dispatch is one
// native Undo step. Rejected or stale targets publish nothing.
import {id,type RichPresentationModel,type ElementNode} from "@breditor/experimental-rich-content/rendering";
import type {SharedDomEditor} from "./controller.js";
import type {SharedSelectionPolicy} from "./types.js";
import {sharedPresentationModel} from "./document_presentation.js";
import {resolveSharedBlockMove,resolveSharedBlockStep,sharedBlockDropTargets,sharedHandleBlock,sharedSelectionBlock,type SharedBlockDropTarget,type SharedBlockMovePolicy,type SharedBlockMoveResolution,type SharedBlockMoveRejection} from "./block_move.js";

export interface SharedBlockDragOptions {
 /** Default `sibling-v1`; `flow-v1` additionally offers grammar-legal cross-container drops. */
 policy?:SharedBlockMovePolicy;
 /** Accessible handle label. */
 label?:string;
 /** Called after Rust accepted one move publication. */
 onMove?:(event:{block:string;parent:string|null;before:string|null;source:"pointer"|"keyboard"})=>void;
 /** Called when a pointer drop or keyboard request is refused before or by native admission. */
 onReject?:(event:{block:string;reason:SharedBlockMoveRejection|"native"})=>void;
}
export interface SharedBlockDrag {
 readonly layer:HTMLDivElement;readonly handle:HTMLButtonElement;readonly indicator:HTMLDivElement;
 /** Block currently owning the handle, or null when hidden. */
 activeBlock():string|null;
 /** Programmatic equivalent of a drop. Returns true when Rust accepted one move. */
 move(block:string,target:SharedBlockDropTarget):boolean;
 /** Programmatic equivalent of Alt+Shift+ArrowUp/ArrowDown. */
 step(block:string,direction:-1|1):boolean;
 dispose():void;
}

const MESSAGES:Readonly<Record<SharedBlockMoveRejection|"native",string>>={
 read_only:"The document is read-only.",unknown_block:"That block no longer exists.",not_movable:"This block cannot be moved.",
 invalid_target:"Blocks cannot be dropped there.",cyclic:"A block cannot be moved inside itself.",cross_container:"Blocks can only be reordered within their container.",
 grammar:"That container does not accept this block.",empties_source:"Moving the last block would leave its container empty.",item_lead:"A list or task item must start with a text line.",
 boundary:"The block is already at the edge of its container.",native:"The editor refused the move.",
};
export const sharedBlockDragStyles=`.breditor-block-drag-handle{position:fixed;z-index:20;display:inline-flex;align-items:center;justify-content:center;width:20px;height:22px;padding:0;border:0;border-radius:4px;background:transparent;color:#6b7280;cursor:grab;touch-action:none;user-select:none;font:14px/1 system-ui}.breditor-block-drag-handle:hover,.breditor-block-drag-handle:focus-visible,.breditor-block-drag-handle[aria-pressed=true]{background:#e5e7eb;color:#111827}.breditor-block-drag-handle[hidden]{display:none}.breditor-block-drag[data-dragging] .breditor-block-drag-handle{cursor:grabbing;pointer-events:none}.breditor-block-drop-indicator{position:fixed;z-index:19;height:0;border-top:2px solid var(--breditor-drop-color,#2563eb);pointer-events:none}.breditor-block-drop-indicator[data-state=invalid]{border-top-style:dashed;border-color:var(--breditor-drop-invalid-color,#dc2626)}.breditor-block-drop-indicator[hidden]{display:none}.breditor-block-drag-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}`;

type Located=SharedBlockDropTarget&{parent:string|null;before:string|null};
interface Hit {resolution:SharedBlockMoveResolution;target:SharedBlockDropTarget|null;element:HTMLElement|null}

export function mountSharedBlockDrag<P extends SharedSelectionPolicy>(editor:SharedDomEditor<P>,options:SharedBlockDragOptions={}):SharedBlockDrag{
 const policy=options.policy??"sibling-v1";if(policy!=="sibling-v1"&&policy!=="flow-v1")throw new TypeError("Expected block move policy sibling-v1 or flow-v1");
 const surface=editor.surface,d=surface.ownerDocument,win=d.defaultView!,abort=new AbortController(),signal=abort.signal;
 const layer=d.createElement("div");layer.className="breditor-block-drag";
 const style=d.createElement("style");style.textContent=sharedBlockDragStyles;
 const handle=d.createElement("button");handle.type="button";handle.className="breditor-block-drag-handle";handle.textContent="⋮⋮";handle.hidden=true;handle.draggable=false;
 handle.setAttribute("aria-label",options.label??"Move block");handle.setAttribute("aria-pressed","false");
 const help=d.createElement("span");help.className="breditor-block-drag-live";help.id=`breditor-block-drag-help-${Math.random().toString(36).slice(2)}`;
 help.textContent="Drag to move. Or press Enter to pick up, arrow keys to choose a position, Enter to drop, Escape to cancel. Alt+Shift+Up or Down moves one step.";
 handle.setAttribute("aria-describedby",help.id);
 const indicator=d.createElement("div");indicator.className="breditor-block-drop-indicator";indicator.hidden=true;indicator.setAttribute("aria-hidden","true");
 const live=d.createElement("p");live.className="breditor-block-drag-live";live.setAttribute("role","status");live.setAttribute("aria-live","polite");
 layer.append(style,handle,help,indicator,live);editor.status.before(layer);

 let cached:{revision:string;model:RichPresentationModel}|undefined,active:string|null=null,disposed=false;
 let drag:{block:string;pointer:number;hit:Hit|null}|undefined,mode:{block:string;targets:readonly Located[];index:number}|undefined;
 const model=():RichPresentationModel=>{const view=editor.view();if(cached?.revision!==view.revision){const family=(view.format==="breditor/shared-document-view"?"document-v1":"original") as P;cached={revision:view.revision,model:sharedPresentationModel<P>(view,family)};}return cached.model;};
 const elementFor=(block:string):HTMLElement|null=>{for(const element of surface.querySelectorAll<HTMLElement>("[data-rich-block]"))if(element.dataset["richBlock"]===block)return element;return null;};
 const announce=(message:string):void=>{live.textContent=message;};
 const readOnly=():boolean=>editor.view().readOnly===true;

 function place():void{
  if(disposed)return;const element=active&&!readOnly()?elementFor(active):null;
  if(!element){if(!mode&&!drag){handle.hidden=true;active=null;}return;}
  const rect=element.getBoundingClientRect();handle.hidden=false;handle.style.top=`${rect.top}px`;handle.style.left=`${Math.max(0,rect.left-24)}px`;
  if(mode)showTarget(mode.targets[mode.index]);
 }
 function setActive(block:string|null):void{if(drag||mode)return;active=block;place();}
 function hideIndicator():void{indicator.hidden=true;delete indicator.dataset["state"];delete layer.dataset["dropRejected"];}
 function showLine(element:HTMLElement,side:"before"|"after",valid:boolean):void{
  const rect=element.getBoundingClientRect();indicator.hidden=false;indicator.dataset["state"]=valid?"valid":"invalid";
  indicator.style.top=`${(side==="before"?rect.top:rect.bottom)-1}px`;indicator.style.left=`${rect.left}px`;indicator.style.width=`${rect.width}px`;
 }
 function showTarget(target:Located|undefined):void{const element=target&&elementFor(target.anchor);if(!target||!element){hideIndicator();return;}delete layer.dataset["dropRejected"];showLine(element,target.side,true);}

 /** Deepest-first semantic resolution: climb rendered blocks under the pointer until one admits the drop. */
 function hitAt(block:string,x:number,y:number):Hit|null{
  const under=d.elementFromPoint?.(x,y);if(!under||!surface.contains(under))return null;
  const value=model();let first:Hit|null=null;
  for(let element=(under as Element).closest<HTMLElement>("[data-rich-block]");element&&surface.contains(element);element=element.parentElement?.closest<HTMLElement>("[data-rich-block]")??null){
   const anchor=element.dataset["richBlock"]!,rect=element.getBoundingClientRect(),side=y<rect.top+rect.height/2?"before":"after";
   const target={anchor,side} as const,resolution=resolveSharedBlockMove(value,block,target,policy),hit={resolution,target,element};
   if(resolution.kind!=="rejected")return hit;first??=hit;
  }
  return first;
 }
 function reject(block:string,reason:SharedBlockMoveRejection|"native"):false{announce(MESSAGES[reason]);try{options.onReject?.({block,reason});}catch{/* host callback cannot rewind */}return false;}
 /** Close an open typing group first, then plan against the fresh publication and dispatch with its
  * exact revision: a stale plan is refused by the native guard and nothing is published. */
 function plan(block:string,produce:(value:RichPresentationModel)=>SharedBlockMoveResolution,source:"pointer"|"keyboard",focus:boolean):boolean{
  if(disposed)return false;
  try{if(editor.view().historyGrouping==="typing-v1")editor.closeTypingGroup();}catch{return reject(block,"native");}
  const value=model(),resolution=produce(value);
  if(resolution.kind==="unchanged"){announce("Block left in place.");return false;}
  if(resolution.kind==="rejected")return reject(block,resolution.reason);
  try{editor.execute({commands:[resolution.command]},focus,value.view.revision);}catch{return reject(block,"native");}
  announce("Block moved.");
  try{options.onMove?.({block,parent:resolution.parent,before:resolution.before,source});}catch{/* host callback cannot rewind */}
  return true;
 }

 // Hover/focus ownership of the single floating handle.
 surface.addEventListener("pointermove",event=>{if(drag||mode)return;const element=(event.target as Element|null)?.closest?.<HTMLElement>("[data-rich-block]");const block=element?.dataset["richBlock"];setActive(block?sharedHandleBlock(model(),block):null);},{signal});
 surface.addEventListener("focusin",()=>{if(!handle.matches(":hover"))setActive(sharedSelectionBlock(model()));},{signal});
 handle.addEventListener("focus",()=>{if(!active)setActive(sharedSelectionBlock(model()));},{signal});
 handle.addEventListener("blur",()=>{if(mode)cancelMode("Move cancelled.");},{signal});

 // Pointer drag.
 handle.addEventListener("pointerdown",event=>{
  if(event.button!==0||!active||readOnly()||mode)return;event.preventDefault();
  drag={block:active,pointer:event.pointerId,hit:null};layer.dataset["dragging"]="";announce("Dragging block.");
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
  if(!drop){announce("Move cancelled.");return;}
  if(!hit){reject(block,"invalid_target");return;}
  const target=hit.target!;plan(block,value=>resolveSharedBlockMove(value,block,target,policy),"pointer",true);place();
 };
 win.addEventListener("pointerup",event=>{if(drag&&event.pointerId===drag.pointer)endDrag(true);},{signal});
 win.addEventListener("pointercancel",event=>{if(drag&&event.pointerId===drag.pointer)endDrag(false);},{signal});
 win.addEventListener("keydown",event=>{if(drag&&event.key==="Escape"){event.preventDefault();endDrag(false);}},{signal,capture:true});

 // Keyboard move mode on the focused handle.
 const order=():{pre:Map<string,number>;end:Map<string,number>}=>{const pre=new Map<string,number>(),end=new Map<string,number>();let n=0;const walk=(node:ElementNode):void=>{for(const child of node.children){if(child.kind!=="element")continue;const key=id(child);pre.set(key,n++);walk(child);end.set(key,n-1);}};walk(model().root);return {pre,end};};
 function startMode():void{
  const block=active;if(!block||readOnly())return;const targets=sharedBlockDropTargets(model(),block,policy);
  if(!targets.length){announce("No other position accepts this block.");return;}
  mode={block,targets,index:-1};handle.setAttribute("aria-pressed","true");announce(`Picked up block. ${targets.length} positions available.`);
 }
 function cancelMode(message:string):void{if(!mode)return;mode=undefined;handle.setAttribute("aria-pressed","false");hideIndicator();announce(message);}
 function cycle(direction:-1|1|"first"|"last"):void{
  if(!mode)return;const count=mode.targets.length;
  if(direction==="first")mode.index=0;else if(direction==="last")mode.index=count-1;
  else if(mode.index<0){const {pre,end}=order(),at=pre.get(mode.block)!,tail=end.get(mode.block)!;const key=(t:Located):number=>t.side==="before"?pre.get(t.anchor)!-0.5:end.get(t.anchor)!+0.5;
   if(direction<0){let found=-1;mode.targets.forEach((t,i)=>{if(key(t)<at)found=i;});mode.index=found<0?0:found;}
   else{const found=mode.targets.findIndex(t=>key(t)>tail);mode.index=found<0?count-1:found;}}
  else mode.index=Math.min(count-1,Math.max(0,mode.index+direction));
  showTarget(mode.targets[mode.index]);announce(`Position ${mode.index+1} of ${count}.`);
 }
 handle.addEventListener("keydown",event=>{
  if(event.isComposing)return;const k=event.key;
  if(mode){
   if(k==="Escape"){event.preventDefault();cancelMode("Move cancelled.");return;}
   if(k==="ArrowUp"||k==="ArrowLeft"){event.preventDefault();cycle(-1);return;}
   if(k==="ArrowDown"||k==="ArrowRight"){event.preventDefault();cycle(1);return;}
   if(k==="Home"||k==="End"){event.preventDefault();cycle(k==="Home"?"first":"last");return;}
   if(k==="Enter"||k===" "){event.preventDefault();const {block,targets,index}=mode;const target=targets[index];mode=undefined;handle.setAttribute("aria-pressed","false");hideIndicator();
    if(!target){announce("Move cancelled.");return;}plan(block,value=>resolveSharedBlockMove(value,block,target,policy),"keyboard",false);place();return;}
   return;
  }
  if(event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&(k==="ArrowUp"||k==="ArrowDown")){event.preventDefault();if(active){plan(active,value=>resolveSharedBlockStep(value,active!,k==="ArrowUp"?-1:1),"keyboard",false);place();}return;}
  if(k==="Enter"||k===" "){event.preventDefault();startMode();return;}
  if(k==="Escape"){event.preventDefault();editor.focus();}
 },{signal});
 // Reserved editor shortcut: Alt+Shift+ArrowUp/ArrowDown moves the caret's block one sibling slot.
 layer.parentElement!.addEventListener("keydown",event=>{
  if(event.isComposing||!(event.target instanceof Node)||!surface.contains(event.target))return;
  if(!event.altKey||!event.shiftKey||event.ctrlKey||event.metaKey||(event.key!=="ArrowUp"&&event.key!=="ArrowDown"))return;
  event.preventDefault();event.stopPropagation();
  const block=sharedSelectionBlock(model());if(!block){announce(MESSAGES.not_movable);return;}
  plan(block,value=>resolveSharedBlockStep(value,block,event.key==="ArrowUp"?-1:1),"keyboard",true);setActive(block);
 },{signal,capture:true});

 const observer=new win.MutationObserver(()=>place());observer.observe(surface,{childList:true,subtree:true,characterData:true});
 win.addEventListener("scroll",()=>place(),{signal,capture:true,passive:true});win.addEventListener("resize",()=>place(),{signal});

 return {layer,handle,indicator,
  activeBlock:()=>active,
  move:(block,target)=>plan(block,value=>resolveSharedBlockMove(value,block,target,policy),"keyboard",false),
  step:(block,direction)=>plan(block,value=>resolveSharedBlockStep(value,block,direction),"keyboard",false),
  dispose(){if(disposed)return;disposed=true;drag=undefined;mode=undefined;abort.abort();observer.disconnect();layer.remove();},
 };
}
