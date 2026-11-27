// Native inline drag-and-drop for the local and shared rich editors, behind one small host port.
// The DOM is presentation only. A drag started from a selection carries the same clipboard flavors
// Copy produces; a drop inside the same editor is planned here and published by the host as ONE
// guarded native change (local `dropText`, shared `replace_text_range` batch) at the planned
// revision. The browser never mutates the editable DOM: every drop over the surface is prevented.
// Drops from elsewhere go through the host's ordinary paste path; files keep the file path.
import {isText,type ElementNode,type RichPresentationModel} from "./model.js";
import {readTarget} from "./selection.js";
import type {FormatLiteral,RichDocumentSelection,RichPoint,RichSelection} from "./core.js";

export type RichTextDropEffect="move"|"copy";
/** Why an internal drop target is refused. Nothing is published for any of them. */
export type RichTextDropRejection=
 |"read_only"     // the editor is read-only (a copy out of it is still allowed)
 |"source"        // the current selection is not one nonempty range inside one text block
 |"inside_source" // the target lies strictly inside the dragged range
 |"not_editable"  // the pointer is not over editable text (an image, a checkbox, outside the surface)
 |"incompatible"; // the target container cannot hold the content (formatted text into a code block)
export type RichTextDropSource=Extract<RichSelection,{kind:"text"}>;
export interface RichTextDrop {readonly source:RichTextDropSource;readonly target:RichPoint;readonly effect:RichTextDropEffect}
export type RichTextDropResolution=
 |{readonly kind:"drop";readonly drop:RichTextDrop}
 |{readonly kind:"unchanged"}
 |{readonly kind:"rejected";readonly reason:RichTextDropRejection};
export interface RichTextRun {readonly text:string;readonly formats:readonly FormatLiteral[]}

const ordered=(source:RichTextDropSource):[number,number]=>{const a=Number(source.anchor.offset),f=Number(source.focus.offset);return a<=f?[a,f]:[f,a];};
/** Exact runs (text and formats) of a single-block source range in the presentation model. */
export function richTextDropRuns(model:RichPresentationModel,source:RichTextDropSource):readonly RichTextRun[]{
 const node=model.nodes.get(source.anchor.block);if(!node)return [];
 const [start,end]=ordered(source),runs:RichTextRun[]=[];let offset=0;
 for(const child of node.children){
  if(child.kind!=="text")continue;const from=Math.max(start,offset),to=Math.min(end,offset+child.text.length);
  if(from<to)runs.push({text:child.text.slice(from-offset,to-offset),formats:child.formats});
  offset+=child.text.length;
 }
 return runs;
}
/**
 * Plan one same-editor drop of `source` at the caret `target`. Rust stays the final authority
 * (grammar, mentions, restricted regions); this mirrors its rules so the drop cursor can say
 * valid/invalid while dragging.
 */
export function resolveRichTextDrop(model:RichPresentationModel,source:RichSelection|RichDocumentSelection|null,target:RichPoint,effect:RichTextDropEffect):RichTextDropResolution{
 if(model.view.readOnly===true)return {kind:"rejected",reason:"read_only"};
 if(source?.kind!=="text"||source.anchor.block!==source.focus.block||source.anchor.offset===source.focus.offset)return {kind:"rejected",reason:"source"};
 const from=model.nodes.get(source.anchor.block),into=model.nodes.get(target.block);
 if(!from||!isText(from))return {kind:"rejected",reason:"source"};
 if(!into||!isText(into))return {kind:"rejected",reason:"not_editable"};
 const [start,end]=ordered(source),at=Number(target.offset),same=target.block===source.anchor.block;
 if(same&&at>start&&at<end)return {kind:"rejected",reason:"inside_source"};
 if(effect==="move"&&same&&(at===start||at===end))return {kind:"unchanged"};
 if(code(into)&&!code(from)&&richTextDropRuns(model,source).some(run=>run.formats.length>0))return {kind:"rejected",reason:"incompatible"};
 return {kind:"drop",drop:{source,target:{block:target.block,offset:String(at),affinity:"after"},effect}};
}
const code=(node:ElementNode):boolean=>node.type==="breditor/code-block";

/** Alt/Option on Apple platforms, Ctrl elsewhere, turns a move into a copy. */
export function richTextDropEffect(event:{altKey:boolean;ctrlKey:boolean},platform=globalThis.navigator?.platform??""):RichTextDropEffect{
 return (/Mac|iPhone|iPad|iPod/.test(platform)?event.altKey:event.ctrlKey)?"copy":"move";
}

interface Located {readonly point:RichPoint;readonly rect:{readonly left:number;readonly top:number;readonly height:number}}
type CaretDocument=Document&{caretPositionFromPoint?(x:number,y:number):{offsetNode:Node;offset:number}|null;caretRangeFromPoint?(x:number,y:number):Range|null};
/** Inside the editable surface and not inside one of its non-editable islands (images, checkboxes, chips). */
const editable=(element:Element|null,surface:HTMLElement):boolean=>{if(!element||!surface.contains(element))return false;const island=element.closest("[contenteditable=\"false\"]");return !island||!surface.contains(island);};
/**
 * Map a viewport point to one logical caret through the native caret APIs and the DOM projection.
 * A point over a mention chip snaps to its nearer edge; any other non-editable island is refused.
 */
export function richTextDropPoint(surface:HTMLElement,x:number,y:number):Located|null{
 const d=surface.ownerDocument as CaretDocument;let node:Node|null=null,offset=0;
 const position=d.caretPositionFromPoint?.(x,y);
 if(position){node=position.offsetNode;offset=position.offset;}
 else{const range=d.caretRangeFromPoint?.(x,y);if(range){node=range.startContainer;offset=range.startOffset;}}
 if(!node||!surface.contains(node))return null;
 let element=node.nodeType===1?node as Element:node.parentElement;
 const chip=element?.closest<HTMLElement>("[data-mention-id]");
 if(chip&&surface.contains(chip)&&chip.parentNode){
  const box=chip.getBoundingClientRect(),after=x>box.left+box.width/2;
  node=chip.parentNode;offset=Array.prototype.indexOf.call(node.childNodes,chip)+(after?1:0);element=chip.parentElement;
 }
 const block=element?.closest<HTMLElement>("[data-rich-text]");
 if(!block||!surface.contains(block)||!editable(element,surface))return null;
 const target=readTarget(surface,{startContainer:node,startOffset:offset,endContainer:node,endOffset:offset,collapsed:true} as StaticRange);
 if(!target||target.anchor.block!==block.dataset["richText"])return null;
 return {point:target.anchor,rect:caretRect(node,offset,block)};
}
/** Caret geometry: a collapsed range's rect, else the edge of a neighbouring character, else the block. */
function caretRect(node:Node,offset:number,block:HTMLElement):Located["rect"]{
 const d=node.ownerDocument!,measure=(start:number,end:number,edge:"left"|"right"):Located["rect"]|null=>{
  try{const range=d.createRange();range.setStart(node,start);range.setEnd(node,end);const box=range.getBoundingClientRect?.();if(box&&box.height>0)return {left:edge==="left"?box.left:box.right,top:box.top,height:box.height};}catch{/* outside node bounds */}
  return null;
 };
 const length=node.nodeType===3?(node.textContent?.length??0):node.childNodes.length;
 const found=measure(offset,offset,"left")??(node.nodeType===3&&offset<length?measure(offset,offset+1,"left"):null)??(node.nodeType===3&&offset>0?measure(offset-1,offset,"right"):null);
 if(found)return found;
 const box=block.getBoundingClientRect();return {left:box.left,top:box.top,height:box.height||16};
}

export const richTextDragStyles=`.breditor-text-drop-cursor{position:fixed;z-index:20;width:2px;margin-left:-1px;pointer-events:none;background:var(--breditor-drop-color,#2563eb)}.breditor-text-drop-cursor[data-state="invalid"]{background:var(--breditor-drop-invalid-color,#dc2626)}.breditor-text-drop-cursor[hidden]{display:none}`;

/** Host port: what an editor owner offers native inline drag-and-drop. */
export interface RichTextDragPort {
 /** Rendered editable surface carrying `[data-rich-text]` blocks. */
 readonly surface:HTMLElement;
 /** The drop cursor layer is inserted immediately before this element (normally the status line). */
 readonly anchor:HTMLElement;
 readonly signal:AbortSignal;
 /** Presentation model of the current publication. */
 model():RichPresentationModel;
 /** Drags are refused rather than queued while busy or composing. */
 state():{readonly busy:boolean;readonly composing:boolean};
 /** Write the exact clipboard flavors Copy produces for the current selection; false when it has none. */
 copy(data:DataTransfer):boolean;
 /** Close an open natural-typing group so a drop never merges into typed text. */
 closeTypingGroup():void;
 /** Publish one guarded same-editor drop planned at `revision`; throw when the owner refuses it. */
 drop(drop:RichTextDrop,revision:string):void;
 /** A drop from outside this editor: place the caret at `target` and run the ordinary paste path. */
 paste(data:DataTransfer,target:RichPoint):void;
 /** The existing file-drop path. */
 files(files:readonly File[]):void;
}
export interface RichTextDrag {readonly cursor:HTMLDivElement;dispose():void}

/** Mount native inline drag-and-drop on an owner through its port. Both rich DOM editors call it. */
export function mountRichTextDragPort(port:RichTextDragPort):RichTextDrag{
 const surface=port.surface,d=surface.ownerDocument,signal=port.signal;
 const layer=d.createElement("div");layer.className="breditor-text-drag";
 const style=d.createElement("style");style.textContent=richTextDragStyles;
 const cursor=d.createElement("div");cursor.className="breditor-text-drop-cursor";cursor.hidden=true;cursor.setAttribute("aria-hidden","true");cursor.setAttribute("inert","");
 layer.append(style,cursor);port.anchor.before(layer);
 // Present only between this surface's own dragstart and dragend: that is what makes a drop "internal".
 let dragging=false;
 const hide=():void=>{cursor.hidden=true;delete cursor.dataset["state"];delete cursor.dataset["dropRejected"];};
 const show=(located:Located,rejected:RichTextDropRejection|null):void=>{
  cursor.hidden=false;cursor.style.left=`${located.rect.left}px`;cursor.style.top=`${located.rect.top}px`;cursor.style.height=`${located.rect.height}px`;
  cursor.dataset["state"]=rejected?"invalid":"valid";if(rejected)cursor.dataset["dropRejected"]=rejected;else delete cursor.dataset["dropRejected"];
 };
 const files=(event:DragEvent):boolean=>!dragging&&!!event.dataTransfer?.types.includes("Files");
 const plan=(event:DragEvent,located:Located|null):RichTextDropResolution=>{
  if(!located)return {kind:"rejected",reason:"not_editable"};
  const model=port.model();return resolveRichTextDrop(model,model.view.selection,located.point,richTextDropEffect(event));
 };
 surface.addEventListener("dragstart",event=>{
  const data=event.dataTransfer,state=port.state();
  if(!data||state.busy||state.composing){event.preventDefault();return;}
  // Only a selection drags: images are not draggable, and a drag with nothing to copy (a link under
  // a collapsed caret, say) is refused rather than left to edit the surface natively.
  // The browser's own serialization of the selected DOM is replaced by exactly the Copy flavors.
  try{data.clearData();if(!port.copy(data)){event.preventDefault();return;}}catch{event.preventDefault();return;}
  data.effectAllowed=port.model().view.readOnly===true?"copy":"copyMove";dragging=true;
 },{signal});
 surface.addEventListener("dragover",event=>{
  const data=event.dataTransfer;if(!data)return;
  if(files(event)){event.preventDefault();return;}
  const located=richTextDropPoint(surface,event.clientX,event.clientY);
  if(dragging){
   const resolution=plan(event,located);
   if(located)show(located,resolution.kind==="rejected"?resolution.reason:null);else hide();
   if(resolution.kind==="drop"){event.preventDefault();data.dropEffect=resolution.drop.effect;}
   else if(resolution.kind==="unchanged"){event.preventDefault();data.dropEffect="move";}
   else data.dropEffect="none";
   return;
  }
  if(!located||port.model().view.readOnly===true||port.state().composing){hide();data.dropEffect="none";return;}
  show(located,null);event.preventDefault();data.dropEffect="copy";
 },{signal});
 surface.addEventListener("dragleave",event=>{const next=event.relatedTarget as Node|null;if(!next||!surface.contains(next))hide();},{signal});
 surface.addEventListener("drop",event=>{
  hide();const data=event.dataTransfer;if(!data)return;
  // The browser never edits the surface itself; every outcome below goes through the owner.
  event.preventDefault();
  if(files(event)){if(data.files.length)port.files([...data.files]);return;}
  const state=port.state();if(state.busy||state.composing)return;
  if(dragging){
   dragging=false;
   const located=richTextDropPoint(surface,event.clientX,event.clientY);if(!located)return;
   // Close an open typing group first, then plan against that fresh publication and its revision.
   port.closeTypingGroup();
   const resolution=plan(event,located);
   if(resolution.kind==="drop")port.drop(resolution.drop,port.model().view.revision);
   return;
  }
  const located=richTextDropPoint(surface,event.clientX,event.clientY);
  if(located&&port.model().view.readOnly!==true)port.paste(data,located.point);
 },{signal});
 d.addEventListener("dragend",()=>{dragging=false;hide();},{signal,capture:true});
 signal.addEventListener("abort",()=>layer.remove(),{once:true});
 return {cursor,dispose(){layer.remove();}};
}
