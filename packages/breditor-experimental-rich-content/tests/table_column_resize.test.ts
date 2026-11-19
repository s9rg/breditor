// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {mountRichTableColumnResize,richTableColumnResizeCommit,RICH_TABLE_COLUMN_WIDTH_MAX,RICH_TABLE_COLUMN_WIDTH_MIN,type RichTableColumnGeometry,type RichTableColumnResizeHostState,type RichTableColumnResizeHost,type RichTableColumnResizeRequest} from "../src/table_column_resize.js";
import type {RichDomEditor} from "../src/controller.js";

// Compile-time proof that the real local DOM owner satisfies the borrowed port and commit shape.
export const domPort=(dom:RichDomEditor|RichDomEditor<"document-v1">):RichTableColumnResizeHost=>dom;
export const domCommit=(dom:RichDomEditor)=>richTableColumnResizeCommit(dom);

class FakeHost {
 readonly surface=document.createElement("div");
 state:RichTableColumnResizeHostState={revision:"1",closed:false,busy:false,composing:false,readOnly:false};
 tables:RichTableColumnGeometry[]=[{id:"t",hidden:false,rows:["r1","r2"],columns:[{id:"c1",width:160},{id:"c2",width:160}]}];
 listeners=new Set<()=>void>();
 commits:RichTableColumnResizeRequest[]=[];
 constructor(){this.surface.contentEditable="true";this.render();}
 render(){
  const table=document.createElement("table");table.dataset["richTable"]="t";table.dataset["richBlock"]="tb";
  const total=this.tables[0]!.columns.reduce((s,c)=>s+c.width,0);
  table.getBoundingClientRect=()=>({left:100,top:50,right:100+total,bottom:150,width:total,height:100,x:100,y:50,toJSON(){}}) as DOMRect;
  this.surface.replaceChildren(table);
 }
 writingState(){return this.state;}
 subscribeWriting(l:()=>void){this.listeners.add(l);return()=>this.listeners.delete(l);}
 view(){return {revision:this.state.revision,tables:this.tables};}
 /** Simulates one owner publication (local or remote). */
 publish(mutate:()=>void){mutate();this.state={...this.state,revision:String(Number(this.state.revision)+1)};this.render();for(const l of [...this.listeners])l();}
 commit=(request:RichTableColumnResizeRequest)=>{this.commits.push(request);this.publish(()=>{this.tables=[{...this.tables[0]!,columns:this.tables[0]!.columns.map(c=>c.id===request.column?{...c,width:request.width}:c)}];});};
}

const pointer=(type:string,clientX:number,init:PointerEventInit={})=>{
 const Ctor=(window as unknown as {PointerEvent?:typeof PointerEvent}).PointerEvent;
 if(Ctor)return new Ctor(type,{bubbles:true,cancelable:true,clientX,pointerId:1,button:0,isPrimary:true,...init});
 const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientX,button:0});Object.assign(event,{pointerId:1,isPrimary:true,...init});return event;
};
const key=(target:HTMLElement,k:string,init:KeyboardEventInit={})=>target.dispatchEvent(new KeyboardEvent("keydown",{key:k,bubbles:true,cancelable:true,...init}));

let host:FakeHost,overlay:HTMLElement;
beforeEach(()=>{host=new FakeHost();overlay=document.createElement("div");document.body.replaceChildren(host.surface,overlay);});
afterEach(()=>{document.body.replaceChildren();});
const handles=()=>[...overlay.querySelectorAll<HTMLElement>("[role=separator]")];

describe("table column resize handles",()=>{
 it("exposes one focusable separator per column with the admitted width domain",()=>{
  mountRichTableColumnResize(overlay,host,{commit:host.commit});
  const [first,second]=handles();
  expect(handles()).toHaveLength(2);
  expect(first!.tabIndex).toBe(0);
  expect(first!.getAttribute("aria-orientation")).toBe("vertical");
  expect(first!.getAttribute("aria-valuenow")).toBe("160");
  expect(first!.getAttribute("aria-valuemin")).toBe(String(RICH_TABLE_COLUMN_WIDTH_MIN));
  expect(first!.getAttribute("aria-valuemax")).toBe(String(RICH_TABLE_COLUMN_WIDTH_MAX));
  expect(first!.getAttribute("aria-label")).toBe("Resize column 1 of 2");
  expect(first!.style.left).toBe("260px");expect(second!.style.left).toBe("420px");
  expect(host.surface.contains(first!)).toBe(false);
 });

 it("rejects an overlay inside editable content",()=>{
  const inside=document.createElement("div");host.surface.append(inside);
  expect(()=>mountRichTableColumnResize(inside,host,{commit:host.commit})).toThrow(/outside editable content/);
 });

 it("previews a pointer drag without committing, then commits exactly once on release",()=>{
  const resize=mountRichTableColumnResize(overlay,host,{commit:host.commit});const handle=handles()[0]!;
  const before=host.surface.innerHTML;
  handle.dispatchEvent(pointer("pointerdown",260));
  for(const x of [270,290,300,310])handle.dispatchEvent(pointer("pointermove",x));
  expect(resize.preview()).toEqual({table:"t",column:"c1",start:160,width:210});
  expect(host.commits).toHaveLength(0);
  expect(host.surface.innerHTML).toBe(before);
  const guide=overlay.querySelector<HTMLElement>("[data-column-resize-guide]")!;
  expect(guide.hidden).toBe(false);expect(guide.style.left).toBe("310px");
  handle.dispatchEvent(pointer("pointerup",310));
  expect(host.commits).toEqual([{table:"t",block:"tb",column:"c1",width:210,revision:"1"}]);
  expect(resize.preview()).toBeNull();expect(guide.hidden).toBe(true);
  expect(handles()[0]!.getAttribute("aria-valuenow")).toBe("210");
 });

 it("clamps drag widths to 32..4096",()=>{
  mountRichTableColumnResize(overlay,host,{commit:host.commit});const handle=handles()[0]!;
  handle.dispatchEvent(pointer("pointerdown",260));handle.dispatchEvent(pointer("pointermove",-5000));handle.dispatchEvent(pointer("pointerup",-5000));
  expect(host.commits.at(-1)!.width).toBe(32);
  const again=handles()[0]!;
  again.dispatchEvent(pointer("pointerdown",132));again.dispatchEvent(pointer("pointermove",99999));again.dispatchEvent(pointer("pointerup",99999));
  expect(host.commits.at(-1)!.width).toBe(4096);
 });

 it("does not commit an unchanged width",()=>{
  mountRichTableColumnResize(overlay,host,{commit:host.commit});const handle=handles()[0]!;
  handle.dispatchEvent(pointer("pointerdown",260));handle.dispatchEvent(pointer("pointermove",260.2));handle.dispatchEvent(pointer("pointerup",260.2));
  expect(host.commits).toHaveLength(0);
 });

 it("cancels on Escape, blur and pointercancel without committing",()=>{
  const onCancel=vi.fn();
  mountRichTableColumnResize(overlay,host,{commit:host.commit,onCancel});const handle=handles()[0]!;
  handle.dispatchEvent(pointer("pointerdown",260));handle.dispatchEvent(pointer("pointermove",300));
  key(handle,"Escape");handle.dispatchEvent(pointer("pointerup",300));
  handle.dispatchEvent(pointer("pointerdown",260));handle.dispatchEvent(pointer("pointermove",300));
  handle.dispatchEvent(new FocusEvent("blur"));handle.dispatchEvent(pointer("pointerup",300));
  handle.dispatchEvent(pointer("pointerdown",260));handle.dispatchEvent(pointer("pointermove",300));
  handle.dispatchEvent(pointer("pointercancel",300));handle.dispatchEvent(pointer("pointerup",300));
  expect(host.commits).toHaveLength(0);
  expect(onCancel.mock.calls.map(c=>c[0])).toEqual(["escape","blur","pointer-cancel"]);
 });

 it("cancels when a remote publication changes the dragged table, but not for unrelated edits",()=>{
  const onCancel=vi.fn();
  const resize=mountRichTableColumnResize(overlay,host,{commit:host.commit,onCancel});const handle=handles()[0]!;
  handle.dispatchEvent(pointer("pointerdown",260));handle.dispatchEvent(pointer("pointermove",300));
  host.publish(()=>{});// unrelated remote text edit: revision changes, table unchanged
  expect(resize.preview()?.width).toBe(200);
  handle.dispatchEvent(pointer("pointerup",300));
  expect(host.commits).toEqual([{table:"t",block:"tb",column:"c1",width:200,revision:"2"}]);
  const next=handles()[0]!;
  next.dispatchEvent(pointer("pointerdown",300));next.dispatchEvent(pointer("pointermove",340));
  host.publish(()=>{host.tables=[{...host.tables[0]!,columns:[...host.tables[0]!.columns,{id:"c3",width:100}]}];});
  expect(resize.preview()).toBeNull();
  next.dispatchEvent(pointer("pointerup",340));
  expect(host.commits).toHaveLength(1);
  expect(onCancel).toHaveBeenCalledWith("table-changed");
 });

 it("steps with arrows, Shift, PageUp/PageDown, Home and End; each key is one command",()=>{
  mountRichTableColumnResize(overlay,host,{commit:host.commit});
  const at=()=>handles()[1]!;
  key(at(),"ArrowRight");expect(host.commits.at(-1)!.width).toBe(168);
  key(at(),"ArrowLeft",{shiftKey:true});expect(host.commits.at(-1)!.width).toBe(104);
  key(at(),"PageUp");expect(host.commits.at(-1)!.width).toBe(168);
  key(at(),"Home");expect(host.commits.at(-1)!.width).toBe(32);
  key(at(),"ArrowLeft");expect(host.commits).toHaveLength(4);// already at the minimum
  key(at(),"End");expect(host.commits.at(-1)!.width).toBe(4096);
  key(at(),"x");
  expect(host.commits).toHaveLength(5);
  expect(host.commits.every(c=>c.column==="c2")).toBe(true);
 });

 it("keeps focus on the same handle element across publications",()=>{
  mountRichTableColumnResize(overlay,host,{commit:host.commit});const handle=handles()[0]!;handle.focus();
  key(handle,"ArrowRight");
  expect(handles()[0]).toBe(handle);expect(document.activeElement).toBe(handle);
 });

 it("disables commits while read-only, busy or composing",()=>{
  mountRichTableColumnResize(overlay,host,{commit:host.commit});
  host.publish(()=>{host.state={...host.state,composing:true};});
  expect(handles()[0]!.getAttribute("aria-disabled")).toBe("true");
  key(handles()[0]!,"ArrowRight");handles()[0]!.dispatchEvent(pointer("pointerdown",260));handles()[0]!.dispatchEvent(pointer("pointerup",300));
  expect(host.commits).toHaveLength(0);
  host.publish(()=>{host.state={...host.state,composing:false,readOnly:true};});
  expect(handles()).toHaveLength(0);
 });

 it("hides handles for hidden tables and removes everything on dispose",()=>{
  const resize=mountRichTableColumnResize(overlay,host,{commit:host.commit});
  host.publish(()=>{host.tables=[{...host.tables[0]!,hidden:true}];});
  expect(handles()).toHaveLength(0);
  resize.dispose();expect(overlay.children).toHaveLength(0);expect(host.listeners.size).toBe(0);
 });

 it("maps requests to the local owner's existing resizeTableColumn command",()=>{
  const execute=vi.fn(),commit=richTableColumnResizeCommit({execute});
  commit({table:"t",block:"tb",column:"c1",width:200,revision:"7"});
  expect(execute).toHaveBeenCalledWith({kind:"resizeTableColumn",data:{table:"t",column:"c1",width:200}},false,"7");
 });
});
