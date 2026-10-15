import type {SharedDomEditor} from "./controller.js";
import type {SharedPresence} from "./presence.js";
import type {RichPoint,RichSelection,SharedView} from "./types.js";

export interface SharedPresenceOverlayOptions {editor:SharedDomEditor;presence:SharedPresence}
interface Rect {left:number;top:number;width:number;height:number}
const palette=["#b83250","#1768b2","#15734b","#9358a6","#b45c16","#2c7584","#716427","#8f486a"];
const key=(cell:{table:string;row:string;column:string}):string=>JSON.stringify([cell.table,cell.row,cell.column]);
function endpoint(surface:HTMLElement,point:RichPoint):[Node,number]|undefined{
 const block=[...surface.querySelectorAll<HTMLElement>("[data-rich-text]")].find(n=>n.dataset["richText"]===point.block);if(!block)return undefined;
 let left=Number(point.offset);const walker=surface.ownerDocument.createTreeWalker(block,4);let node=walker.nextNode();
 while(node){const size=node.textContent?.length??0;if(left<=size)return[node,left];left-=size;node=walker.nextNode();}
 return left===0?[block,0]:undefined;
}
function textRects(surface:HTMLElement,selection:Extract<RichSelection,{kind:"text"}>):Rect[]{
 const a=endpoint(surface,selection.anchor),f=endpoint(surface,selection.focus);if(!a||!f)return[];
 const range=surface.ownerDocument.createRange();range.setStart(a[0],a[1]);range.setEnd(f[0],f[1]);
 const collapsed=selection.anchor.block===selection.focus.block&&selection.anchor.offset===selection.focus.offset;
 if(range.collapsed&&!collapsed){range.setStart(f[0],f[1]);range.setEnd(a[0],a[1]);}
 if(!collapsed)return[...range.getClientRects()].slice(0,256).map(r=>({left:r.left,top:r.top,width:r.width,height:r.height}));
 let rect=range.getClientRects()[0]??range.getBoundingClientRect();
 if(rect.height===0){const block=(a[0].nodeType===1?a[0] as Element:a[0].parentElement)?.closest<HTMLElement>("[data-rich-text]");if(!block)return[];rect=block.getBoundingClientRect();}
 return[{left:rect.left,top:rect.top,width:2,height:rect.height}];
}
function gridRects(surface:HTMLElement,selection:Extract<RichSelection,{kind:"grid"}>,view:SharedView):Rect[]{
 const table=view.tables.find(t=>t.id===selection.anchor.table);if(!table||table.hidden||selection.focus.table!==table.id)return[];
 const row=(id:string)=>table.rows.indexOf(id),column=(id:string)=>table.columns.findIndex(c=>c.id===id);
 let r0=Math.min(row(selection.anchor.row),row(selection.focus.row)),r1=Math.max(row(selection.anchor.row),row(selection.focus.row)),c0=Math.min(column(selection.anchor.column),column(selection.focus.column)),c1=Math.max(column(selection.anchor.column),column(selection.focus.column));
 if(Math.min(r0,c0)<0)return[];
 const masters=table.cells.filter(c=>key(c.base)===key(c.master));
 // Derive paint bounds only from Rust's already admitted active spans. This is not an editing,
 // merge or selection planner and cannot mutate the model.
 for(let round=0;round<=table.rows.length+table.columns.length;round++){
  let changed=false;for(const cell of masters){const r=row(cell.base.row),c=column(cell.base.column),endR=r+cell.rowSpan-1,endC=c+cell.columnSpan-1;
   if(r>r1||endR<r0||c>c1||endC<c0)continue;
   const next=[Math.min(r0,r),Math.max(r1,endR),Math.min(c0,c),Math.max(c1,endC)];if(next[0]!==r0||next[1]!==r1||next[2]!==c0||next[3]!==c1){[r0,r1,c0,c1]=next as[number,number,number,number];changed=true;}
  }if(!changed)break;
 }
 const wanted=new Set(masters.filter(cell=>{const r=row(cell.base.row),c=column(cell.base.column);return r>=r0&&r<=r1&&c>=c0&&c<=c1;}).map(cell=>key(cell.master)));
 return[...surface.querySelectorAll<HTMLElement>("[data-rich-cell]")].filter(n=>wanted.has(n.dataset["richCell"]??"")).slice(0,256).map(n=>n.getBoundingClientRect());
}
function rectangles(surface:HTMLElement,selection:RichSelection,view:SharedView):Rect[]{
 if(selection.kind==="text")return textRects(surface,selection);
 if(selection.kind==="grid")return gridRects(surface,selection,view);
 const node=[...surface.querySelectorAll<HTMLElement>("[data-rich-block]")].find(n=>n.dataset["richBlock"]===selection.block);return node?[node.getBoundingClientRect()]:[];
}
/** Separate fixed-position paint layer. Never installs native selections, wraps text, changes
 * editor content or owns/disposes its independent editor and presence registry. */
export class SharedPresenceOverlay {
 readonly element:HTMLDivElement;
 #options:SharedPresenceOverlayOptions;#window:Window;#unsubscribe:()=>void;#resize:ResizeObserver;#mutation:MutationObserver;
 #abort=new AbortController();#frame:number|undefined;#closed=false;
 constructor(options:SharedPresenceOverlayOptions){
  this.#options=options;const document=options.editor.surface.ownerDocument,window=document.defaultView;if(!window)throw Error("Presence overlay requires a live document");this.#window=window;
  this.element=document.createElement("div");this.element.dataset["sharedPresenceOverlay"]="";this.element.setAttribute("aria-hidden","true");this.element.style.cssText="position:fixed;inset:0;pointer-events:none;z-index:10;overflow:hidden";document.body.append(this.element);
  this.#unsubscribe=options.presence.subscribe(()=>this.refresh());
  this.#resize=new ResizeObserver(()=>this.refresh());this.#resize.observe(options.editor.surface);
  this.#mutation=new MutationObserver(()=>this.refresh());this.#mutation.observe(options.editor.surface,{childList:true,subtree:true,characterData:true,attributes:true});
  window.addEventListener("resize",()=>this.refresh(),{signal:this.#abort.signal});window.addEventListener("scroll",()=>this.refresh(),{signal:this.#abort.signal,capture:true});this.refresh();
 }
 /** Coalesced read-only paint; useful after host-only layout changes. */
 refresh():void{if(this.#closed||this.#frame!==undefined)return;this.#frame=this.#window.requestAnimationFrame(()=>{this.#frame=undefined;this.#paint();});}
 #paint():void{
  if(this.#closed)return;const {editor,presence}=this.#options,surface=editor.surface,fragment=surface.ownerDocument.createDocumentFragment();let count=0;
  try{if(surface.isConnected){const bounds=surface.getBoundingClientRect(),view=editor.view();
   for(const peer of presence.view()){const resolution=peer.resolution;if(resolution?.kind!=="resolved"||!resolution.selection)continue;
    let labelled=false;for(const rect of rectangles(surface,resolution.selection,view)){
     if(count>=2048)break;const left=Math.max(0,bounds.left,rect.left),top=Math.max(0,bounds.top,rect.top),right=Math.min(this.#window.innerWidth,bounds.right,rect.left+rect.width),bottom=Math.min(this.#window.innerHeight,bounds.bottom,rect.top+rect.height);if(right<=left||bottom<=top)continue;
     const marker=surface.ownerDocument.createElement("div"),color=palette[peer.palette]??palette[0];marker.dataset["peerWriter"]=peer.writer;marker.dataset["peerKind"]=resolution.selection.kind;
     marker.style.cssText=`position:absolute;box-sizing:border-box;left:${left}px;top:${top}px;width:${right-left}px;height:${bottom-top}px;border:1px solid ${color};background:${color}22`;
     if(!labelled){const label=surface.ownerDocument.createElement("span");label.dataset["peerLabel"]="";label.textContent=peer.label;label.style.cssText=`position:absolute;left:0;bottom:100%;white-space:nowrap;background:${color};color:white;font:11px system-ui;padding:1px 4px;border-radius:3px`;marker.append(label);labelled=true;}
     fragment.append(marker);count++;
    }
   }
  }}catch{/* Disposal or temporarily missing layout clears the paint, never document state. */}
  this.element.replaceChildren(fragment);
 }
 dispose():void{if(this.#closed)return;this.#closed=true;this.#unsubscribe();this.#resize.disconnect();this.#mutation.disconnect();this.#abort.abort();if(this.#frame!==undefined)this.#window.cancelAnimationFrame(this.#frame);this.element.remove();}
}
