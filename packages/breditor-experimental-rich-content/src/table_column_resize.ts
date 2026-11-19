/**
 * Opt-in accessible table column resize handles.
 *
 * Handles live in a borrowed overlay host outside editable content. They never
 * mutate rendered document DOM: a pointer drag paints only an overlay guide and
 * then commits exactly one existing column-width command on release, so the
 * owner records one Undo step. Keyboard steps are focusable `role="separator"`
 * value controls; each accepted key commits one command.
 */

/** Admitted Rust column width domain (`ResizeColumn::capture`, logical pixels). */
export const RICH_TABLE_COLUMN_WIDTH_MIN=32;
export const RICH_TABLE_COLUMN_WIDTH_MAX=4096;

export interface RichTableColumnResizeHostState {readonly revision:string;readonly closed:boolean;readonly busy:boolean;readonly composing:boolean;readonly readOnly:boolean}
export interface RichTableColumnGeometry {readonly id:string;readonly hidden:boolean;readonly rows:readonly string[];readonly columns:readonly {readonly id:string;readonly width:number}[]}
/** Structural port satisfied by both `RichDomEditor` and the shared DOM editor. */
export interface RichTableColumnResizeHost {
 readonly surface:HTMLElement;
 writingState():RichTableColumnResizeHostState;
 /** Must notify after every local or remote publication. */
 subscribeWriting(listener:()=>void):()=>void;
 view():{readonly revision:string;readonly tables:readonly RichTableColumnGeometry[]};
}
/** One width command. `table` is the stable table id and `block` its rendered block id. */
export interface RichTableColumnResizeRequest {readonly table:string;readonly block:string;readonly column:string;readonly width:number;readonly revision:string}
export type RichTableColumnResizeCancel="escape"|"blur"|"table-changed"|"unavailable"|"pointer-cancel"|"disposed"|"api";
export interface RichTableColumnResizeOptions {
 /** Publish exactly one existing width command through the owner's action API. */
 commit(request:RichTableColumnResizeRequest):unknown;
 /** Arrow-key step in logical pixels (default 8). Shift+Arrow and PageUp/PageDown use `largeStep` (default 64). */
 step?:number;largeStep?:number;
 label?:(index:number,count:number)=>string;
 onCancel?:(reason:RichTableColumnResizeCancel)=>void;
 onError?:(error:unknown)=>void;
}
export interface RichTableColumnResizePreview {readonly table:string;readonly column:string;readonly start:number;readonly width:number}
export interface RichTableColumnResize {refresh():void;cancel():void;preview():RichTableColumnResizePreview|null;dispose():void}

/** Commit through the local rich owner's existing `resizeTableColumn` command. */
export function richTableColumnResizeCommit(dom:{execute(command:{kind:"resizeTableColumn";data:{table:string;column:string;width:number}},focus?:boolean,expectedRevision?:string):unknown}):(request:RichTableColumnResizeRequest)=>unknown {
 return request=>dom.execute({kind:"resizeTableColumn",data:{table:request.table,column:request.column,width:request.width}},false,request.revision);
}

export function clampRichTableColumnWidth(width:number):number {
 if(!Number.isFinite(width))throw RangeError("Expected a finite column width");
 return Math.min(RICH_TABLE_COLUMN_WIDTH_MAX,Math.max(RICH_TABLE_COLUMN_WIDTH_MIN,Math.round(width)));
}

const signature=(table:RichTableColumnGeometry|undefined):string=>table?JSON.stringify([table.hidden,table.rows,table.columns.map(c=>[c.id,c.width])]):"";
const positiveStep=(value:number|undefined,fallback:number,name:string):number=>{if(value===undefined)return fallback;if(!Number.isSafeInteger(value)||value<1||value>RICH_TABLE_COLUMN_WIDTH_MAX)throw RangeError(`Expected a positive integer ${name}`);return value;};
const roots=new WeakSet<HTMLElement>();
export const richTableColumnResizeStyles=`[data-breditor-column-resize]{position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none}[data-breditor-column-resize] [role=separator]{position:absolute;width:9px;margin-left:-4px;cursor:col-resize;pointer-events:auto;touch-action:none;background:transparent;outline:none}[data-breditor-column-resize] [role=separator]:hover,[data-breditor-column-resize] [role=separator]:focus-visible,[data-breditor-column-resize] [role=separator][data-dragging]{background:linear-gradient(90deg,transparent 3px,#398a79 3px,#398a79 6px,transparent 6px)}[data-breditor-column-resize] [role=separator][aria-disabled=true]{cursor:default;background:none}[data-breditor-column-resize] [data-column-resize-guide]{position:absolute;width:0;border-left:2px dashed #398a79;pointer-events:none}[data-breditor-column-resize] [data-column-resize-badge]{position:absolute;font:11px system-ui,sans-serif;background:#173d37;color:white;padding:1px 5px;border-radius:3px;white-space:nowrap;pointer-events:none}`;

interface Drag {pointer:number;handle:HTMLElement;table:string;block:string;column:string;start:number;width:number;startX:number;scale:number;signature:string;edge:number}

/**
 * Mount handles for every visible table column boundary in `host.surface`.
 * `overlay` must be an unused element outside editable content in the same document.
 */
export function mountRichTableColumnResize(overlay:HTMLElement,host:RichTableColumnResizeHost,options:RichTableColumnResizeOptions):RichTableColumnResize {
 if(roots.has(overlay)||overlay===host.surface||overlay.contains(host.surface)||host.surface.contains(overlay)||overlay.ownerDocument!==host.surface.ownerDocument)throw Error("Column resize handles need an unused host outside editable content");
 if(typeof options?.commit!=="function")throw TypeError("Column resize handles need an explicit commit command");
 const step=positiveStep(options.step,8,"step"),largeStep=positiveStep(options.largeStep,64,"largeStep");
 const d=overlay.ownerDocument,win=d.defaultView!,abort=new win.AbortController(),layer=d.createElement("div"),guide=d.createElement("div"),badge=d.createElement("div"),handles=new Map<string,HTMLElement>();
 let disposed=false,drag:Drag|undefined;
 layer.dataset["breditorColumnResize"]="";guide.dataset["columnResizeGuide"]="";badge.dataset["columnResizeBadge"]="";guide.setAttribute("aria-hidden","true");badge.setAttribute("aria-hidden","true");guide.hidden=badge.hidden=true;
 const style=d.createElement("style");style.textContent=richTableColumnResizeStyles;layer.append(style,guide,badge);
 const report=(error:unknown)=>{try{options.onError?.(error);}catch{/* A reporter cannot change document ownership. */}};
 const tables=()=>host.view().tables;
 const editable=(state:RichTableColumnResizeHostState)=>!state.closed&&!state.readOnly&&!state.busy&&!state.composing;
 const element=(table:string)=>[...host.surface.querySelectorAll<HTMLElement>("table[data-rich-table]")].find(e=>e.dataset["richTable"]===table);
 const measure=(table:RichTableColumnGeometry,dom:HTMLElement)=>{
  const rect=dom.getBoundingClientRect(),origin=layer.getBoundingClientRect(),total=table.columns.reduce((sum,c)=>sum+c.width,0),scale=total>0&&rect.width>0?rect.width/total:1;
  return {rect,origin,scale};
 };
 const paintPreview=()=>{
  if(!drag){guide.hidden=badge.hidden=true;return;}
  const x=drag.edge+(drag.width-drag.start)*drag.scale,origin=layer.getBoundingClientRect(),dom=element(drag.table),rect=dom?.getBoundingClientRect();
  guide.hidden=badge.hidden=false;guide.style.left=`${x-origin.left}px`;guide.style.top=`${(rect?.top??0)-origin.top}px`;guide.style.height=`${rect?.height??0}px`;
  badge.style.left=`${x-origin.left+6}px`;badge.style.top=`${(rect?.top??0)-origin.top}px`;badge.textContent=`${drag.width}px`;
  drag.handle.setAttribute("aria-valuetext",`${drag.width} pixels (preview)`);
 };
 const cancel=(reason:RichTableColumnResizeCancel)=>{
  if(!drag)return;const current=drag;drag=undefined;current.handle.removeAttribute("data-dragging");
  try{if(current.handle.hasPointerCapture?.(current.pointer))current.handle.releasePointerCapture(current.pointer);}catch{/* Capture may already be gone. */}
  paintPreview();refresh();try{options.onCancel?.(reason);}catch(error){report(error);}
 };
 const commit=(table:string,block:string,column:string,width:number,expected:number)=>{
  const state=host.writingState(),geometry=tables().find(t=>t.id===table),current=geometry?.columns.find(c=>c.id===column);
  if(!editable(state)||!current||geometry!.hidden||current.width!==expected||width===expected)return;
  try{options.commit({table,block,column,width:clampRichTableColumnWidth(width),revision:state.revision});}catch(error){report(error);}
  refresh();
 };
 function refresh():void {
  if(disposed)return;
  let state:RichTableColumnResizeHostState,list:readonly RichTableColumnGeometry[];
  try{state=host.writingState();list=state.closed?[]:tables();}catch(error){report(error);state={revision:"",closed:true,busy:false,composing:false,readOnly:true};list=[];}
  if(drag){const table=list.find(t=>t.id===drag!.table);if(state.closed||state.readOnly||state.composing)cancel("unavailable");else if(signature(table)!==drag.signature)cancel("table-changed");}
  const seen=new Set<string>();
  if(!state.closed&&!state.readOnly)for(const table of list){
   if(table.hidden)continue;const dom=element(table.id);if(!dom)continue;
   const {rect,origin,scale}=measure(table,dom);let edge=rect.left;
   table.columns.forEach((column,index)=>{
    edge+=column.width*scale;const key=JSON.stringify([table.id,column.id]);seen.add(key);
    let handle=handles.get(key);
    if(!handle){handle=create(table.id,column.id);handles.set(key,handle);layer.append(handle);}
    handle.dataset["block"]=dom.dataset["richBlock"]??"";handle.dataset["edge"]=String(edge);handle.dataset["scale"]=String(scale);
    handle.setAttribute("aria-label",options.label?.(index,table.columns.length)??`Resize column ${index+1} of ${table.columns.length}`);
    handle.setAttribute("aria-valuenow",String(column.width));if(drag?.handle!==handle)handle.setAttribute("aria-valuetext",`${column.width} pixels`);
    const enabled=editable(state);handle.setAttribute("aria-disabled",String(!enabled));
    handle.style.left=`${edge-origin.left}px`;handle.style.top=`${rect.top-origin.top}px`;handle.style.height=`${rect.height}px`;
   });
  }
  for(const [key,handle] of handles)if(!seen.has(key)){if(drag?.handle===handle)cancel("table-changed");handles.delete(key);handle.remove();}
  paintPreview();
 }
 function create(table:string,column:string):HTMLElement {
  const handle=d.createElement("div");handle.setAttribute("role","separator");handle.setAttribute("aria-orientation","vertical");handle.tabIndex=0;
  handle.setAttribute("aria-valuemin",String(RICH_TABLE_COLUMN_WIDTH_MIN));handle.setAttribute("aria-valuemax",String(RICH_TABLE_COLUMN_WIDTH_MAX));
  handle.dataset["table"]=table;handle.dataset["column"]=column;
  const width=()=>tables().find(t=>t.id===table)?.columns.find(c=>c.id===column)?.width;
  handle.addEventListener("keydown",event=>{
   if(event.key==="Escape"){if(drag){event.preventDefault();event.stopPropagation();cancel("escape");}return;}
   if(drag||event.altKey||event.ctrlKey||event.metaKey)return;
   const current=width();if(current===undefined)return;
   const large=event.shiftKey?largeStep:step;let next:number|undefined;
   switch(event.key){case "ArrowLeft":next=current-large;break;case "ArrowRight":next=current+large;break;case "PageDown":next=current-largeStep;break;case "PageUp":next=current+largeStep;break;case "Home":next=RICH_TABLE_COLUMN_WIDTH_MIN;break;case "End":next=RICH_TABLE_COLUMN_WIDTH_MAX;break;default:return;}
   event.preventDefault();commit(table,handle.dataset["block"]??"",column,clampRichTableColumnWidth(next),current);
  },{signal:abort.signal});
  handle.addEventListener("pointerdown",event=>{
   if(event.button!==0||drag||!event.isPrimary&&event.isPrimary!==undefined)return;
   const current=width(),state=host.writingState();if(current===undefined||!editable(state))return;
   event.preventDefault();handle.focus({preventScroll:true});
   try{handle.setPointerCapture?.(event.pointerId);}catch{/* Synthetic or detached pointer. */}
   drag={pointer:event.pointerId,handle,table,block:handle.dataset["block"]??"",column,start:current,width:current,startX:event.clientX,scale:Number(handle.dataset["scale"])||1,edge:Number(handle.dataset["edge"])||0,signature:signature(tables().find(t=>t.id===table))};
   handle.dataset["dragging"]="";paintPreview();
  },{signal:abort.signal});
  handle.addEventListener("pointermove",event=>{
   if(!drag||drag.handle!==handle||event.pointerId!==drag.pointer)return;event.preventDefault();
   drag.width=clampRichTableColumnWidth(drag.start+(event.clientX-drag.startX)/drag.scale);paintPreview();
  },{signal:abort.signal});
  handle.addEventListener("pointerup",event=>{
   if(!drag||drag.handle!==handle||event.pointerId!==drag.pointer)return;event.preventDefault();
   const done=drag;drag=undefined;handle.removeAttribute("data-dragging");
   try{if(handle.hasPointerCapture?.(done.pointer))handle.releasePointerCapture(done.pointer);}catch{/* Already released. */}
   paintPreview();
   // A table changed since drag start was already cancelled by refresh; recheck before the one commit.
   if(signature(tables().find(t=>t.id===done.table))!==done.signature){refresh();try{options.onCancel?.("table-changed");}catch(error){report(error);}return;}
   commit(done.table,done.block,done.column,done.width,done.start);
  },{signal:abort.signal});
  handle.addEventListener("pointercancel",event=>{if(drag?.handle===handle&&event.pointerId===drag.pointer)cancel("pointer-cancel");},{signal:abort.signal});
  handle.addEventListener("lostpointercapture",event=>{if(drag?.handle===handle&&event.pointerId===drag.pointer)cancel("pointer-cancel");},{signal:abort.signal});
  handle.addEventListener("blur",()=>{if(drag?.handle===handle)cancel("blur");},{signal:abort.signal});
  return handle;
 }
 d.addEventListener("keydown",event=>{if(drag&&event.key==="Escape"){event.preventDefault();event.stopPropagation();cancel("escape");}},{capture:true,signal:abort.signal});
 win.addEventListener("blur",()=>cancel("blur"),{signal:abort.signal});
 win.addEventListener("resize",()=>refresh(),{signal:abort.signal});
 d.addEventListener("scroll",()=>refresh(),{capture:true,passive:true,signal:abort.signal});
 const ResizeObserverCtor=(win as unknown as {ResizeObserver?:typeof ResizeObserver}).ResizeObserver,observer=ResizeObserverCtor?new ResizeObserverCtor(()=>refresh()):undefined;
 const unsubscribe=host.subscribeWriting(()=>refresh());
 try{roots.add(overlay);overlay.append(layer);observer?.observe(host.surface);refresh();}
 catch(error){unsubscribe();observer?.disconnect();abort.abort();roots.delete(overlay);layer.remove();throw error;}
 return {
  refresh,
  cancel(){cancel("api");},
  preview(){return drag?Object.freeze({table:drag.table,column:drag.column,start:drag.start,width:drag.width}):null;},
  dispose(){if(disposed)return;cancel("disposed");disposed=true;unsubscribe();observer?.disconnect();abort.abort();handles.clear();layer.remove();roots.delete(overlay);},
 };
}
