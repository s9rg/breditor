import {afterEach,describe,expect,it,vi} from "vitest";
import {RichDomEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {mountRichBlockDrag,type RichBlockDragOptions} from "../../breditor-experimental-rich-content/src/block_drag.js";
import {resolveRichBlockMove} from "../../breditor-experimental-rich-content/src/block_move.js";
import {model} from "../../breditor-experimental-rich-content/src/model.js";
import type {RichCoreEditor,RichView,RichSelection,RichCommand} from "../../breditor-experimental-rich-content/src/core.js";

// Native state is stubbed: the fake core applies `moveBlock` as one retained-ID move with one undo
// entry. The real Rust admission is covered by crates/breditor-core/tests/rich_block_move.rs and the
// release-Wasm browser probe in experiments/rich-browser/block-drag.spec.mjs.
type N={kind:"element";type:string;entityId:null;properties:Record<string,unknown>;children:(N|{kind:"text";text:string;formats:[]})[]};
const el=(type:string,block:string,children:N["children"]=[]):N=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block},children});
const p=(block:string)=>el("paragraph",block,[{kind:"text",text:block,formats:[]}]);
/** a, b, list L [i1 [i1p], i2 [i2p]], quote Q [q1], c */
function tree():N{
 const root=el("document","root",[p("a"),p("b"),el("bullet-list","L",[el("list-item","i1",[p("i1p")]),el("list-item","i2",[p("i2p")])]),el("blockquote","Q",[p("q1")]),p("c")]);
 root.properties={"breditor/document-id":"room"};return root;
}
const caret=(block:string):RichSelection=>({kind:"text",anchor:{block,offset:"0",affinity:"after"},focus:{block,offset:"0",affinity:"after"}});
function moveIn(root:N,block:string,parent:string|null,before:string|null):void{
 const find=(node:N,key:string|null):N|undefined=>{if(key===null)return root;if(node.properties["breditor/block-id"]===key)return node;for(const child of node.children)if(child.kind==="element"){const hit=find(child,key);if(hit)return hit;}return undefined;};
 const detach=(node:N):N|undefined=>{const index=node.children.findIndex(c=>c.kind==="element"&&c.properties["breditor/block-id"]===block);if(index>=0)return node.children.splice(index,1)[0] as N;for(const child of node.children)if(child.kind==="element"){const hit=detach(child);if(hit)return hit;}return undefined;};
 const moved=detach(root)!,target=find(root,parent)!,index=before===null?target.children.length:target.children.findIndex(c=>c.kind==="element"&&c.properties["breditor/block-id"]===before);
 target.children.splice(index,0,moved);
}
function fixture(options:RichBlockDragOptions={},{reject=false,readOnly=false,natural=false}={}){
 let root=tree(),revision=1,selection:RichSelection|null=caret("a"),policy=readOnly;const undo:{root:string;selection:RichSelection|null}[]=[],commands:RichCommand[]=[];
 const view=():RichView=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson:JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/local-block-drag",version:1},schemaFingerprint:"fixture",root}),selection,pendingFormatsJson:null,undoDepth:undo.length,redoDepth:0,historyCapacity:100,grid:null,tables:[],...(natural?{historyGrouping:"typing-v1"}:{}),...(policy?{readOnly:true,readOnlyRevision:String(revision)}:{})} as RichView);
 const closeTypingGroup=vi.fn(()=>false);
 const core={view,supportsReadOnly:()=>true,supportsTypingHistory:()=>natural,closeTypingGroup,setReadOnly:(value:boolean)=>{policy=value;revision++;return true;},
  execute:vi.fn((command:RichCommand,expected?:string)=>{
   if(expected!==undefined&&expected!==String(revision))throw Error("stale native guard");
   if(command.kind==="setSelection"){selection=command.selection;revision++;return "selection";}
   if(policy)throw Error("breditor_rich.read_only");
   if(command.kind==="undo"){const entry=undo.pop();if(!entry)return "unchanged";root=JSON.parse(entry.root) as N;selection=entry.selection;revision++;return "undo";}
   if(command.kind!=="moveBlock")throw Error(`unexpected ${command.kind}`);
   commands.push(command);if(reject)throw Error("breditor_rich.command_rejected");
   const before=JSON.stringify(root),candidate=JSON.parse(before) as N;moveIn(candidate,command.data.block,command.data.parent,command.data.before);
   undo.push({root:before,selection});root=candidate;revision++;return "content";
  }),dispose:vi.fn()} as unknown as RichCoreEditor;
 const host=document.createElement("div");document.body.append(host);
 const errors:unknown[]=[];const dom=new RichDomEditor(host,{core,toolbar:[],onError:e=>errors.push(e)});
 const drag=mountRichBlockDrag(dom,options);
 const order=(node:N=root):string[]=>node.children.flatMap(c=>c.kind==="element"?[String(c.properties["breditor/block-id"]),...order(c)]:[]);
 const element=(block:string)=>[...dom.surface.querySelectorAll<HTMLElement>("[data-rich-block]")].find(e=>e.dataset["richBlock"]===block)!;
 return {core,dom,drag,host,errors,commands,undo,closeTypingGroup,order,element,top:()=>root.children.map(c=>String((c as N).properties["breditor/block-id"])),selection:()=>selection,dispose(){drag.dispose();dom.dispose();}};
}
const pointer=(target:EventTarget,type:string,init:{clientX?:number;clientY?:number;button?:number;pointerId?:number}={})=>{const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:init.clientX??0,clientY:init.clientY??0,button:init.button??0});Object.defineProperty(event,"pointerId",{value:init.pointerId??1});target.dispatchEvent(event);return event;};
const key=(target:EventTarget,k:string,init:KeyboardEventInit={})=>{const event=new KeyboardEvent("keydown",{key:k,bubbles:true,cancelable:true,...init});target.dispatchEvent(event);return event;};
function rect(element:HTMLElement,top:number,height=20){element.getBoundingClientRect=()=>({top,bottom:top+height,left:40,right:440,width:400,height,x:40,y:top,toJSON(){return this;}}) as DOMRect;}
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();delete (document as {elementFromPoint?:unknown}).elementFromPoint;});

describe("local RichBlockDrag",()=>{
 it("plans the local moveBlock placement with the shared planner",()=>{
  const value=model(fixture().core.view());
  expect(resolveRichBlockMove(value,"a",{anchor:"b",side:"after"})).toEqual({kind:"move",parent:null,before:"L",move:{block:"a",parent:null,before:"L"}});
  expect(resolveRichBlockMove(value,"a",{anchor:"q1",side:"before"},"flow-v1")).toMatchObject({kind:"move",parent:"Q",before:"q1"});
 });
 it("drops through exactly one moveBlock command and one Undo step restoring order and selection",()=>{
  const t=fixture();try{
   pointer(t.element("b"),"pointermove");expect(t.drag.activeBlock()).toBe("b");expect(t.drag.handle.hidden).toBe(false);
   const target=t.element("c");rect(target,100);(document as {elementFromPoint?:unknown}).elementFromPoint=()=>target;
   pointer(t.drag.handle,"pointerdown");pointer(window,"pointermove",{clientY:115});
   expect(t.drag.indicator.dataset["state"]).toBe("valid");
   pointer(window,"pointerup",{clientY:115});
   expect(t.commands).toEqual([{kind:"moveBlock",data:{block:"b",parent:null,before:null}}]);
   expect(t.top()).toEqual(["a","L","Q","c","b"]);expect(t.undo).toHaveLength(1);
   key(t.dom.surface,"z",{ctrlKey:true});
   expect(t.top()).toEqual(["a","b","L","Q","c"]);expect(t.undo).toHaveLength(0);expect(t.selection()).toEqual(caret("a"));
  }finally{t.dispose();}
 });
 it("moves list items and cross-container blocks under flow-v1",()=>{
  const onMove=vi.fn(),t=fixture({policy:"flow-v1",onMove});try{
   expect(t.drag.move("i2",{anchor:"i1",side:"before"})).toBe(true);
   expect(t.drag.move("a",{anchor:"q1",side:"after"})).toBe(true);
   expect(t.commands).toEqual([{kind:"moveBlock",data:{block:"i2",parent:"L",before:"i1"}},{kind:"moveBlock",data:{block:"a",parent:"Q",before:null}}]);
   expect(t.order()).toEqual(["b","L","i2","i2p","i1","i1p","Q","q1","a","c"]);
   expect(onMove).toHaveBeenLastCalledWith({block:"a",parent:"Q",before:null,source:"keyboard"});
  }finally{t.dispose();}
 });
 it("rejects cross-container, cyclic and grammar targets without dispatching",()=>{
  const onReject=vi.fn(),t=fixture({onReject});try{
   expect(t.drag.move("a",{anchor:"q1",side:"before"})).toBe(false);
   expect(t.drag.move("L",{anchor:"i1p",side:"before"})).toBe(false);
   expect(t.drag.move("i1",{anchor:"a",side:"after"})).toBe(false);
   expect(onReject.mock.calls.map(c=>c[0].reason)).toEqual(["cross_container","cyclic","cross_container"]);
   const flow=vi.fn(),f=fixture({policy:"flow-v1",onReject:flow});try{
    expect(f.drag.move("i1",{anchor:"a",side:"after"})).toBe(false);expect(f.drag.move("q1",{anchor:"a",side:"before"})).toBe(false);
    expect(flow.mock.calls.map(c=>c[0].reason)).toEqual(["grammar","empties_source"]);expect(f.commands).toEqual([]);
   }finally{f.dispose();}
   expect(t.commands).toEqual([]);
  }finally{t.dispose();}
 });
 it("reports a native refusal and leaves the document untouched",()=>{
  const onReject=vi.fn(),onMove=vi.fn(),t=fixture({onReject,onMove},{reject:true});try{
   expect(t.drag.step("a",1)).toBe(false);expect(t.top()).toEqual(["a","b","L","Q","c"]);
   expect(onReject).toHaveBeenCalledWith({block:"a",reason:"native"});expect(onMove).not.toHaveBeenCalled();expect(t.undo).toHaveLength(0);
  }finally{t.dispose();}
 });
 it("reserves Alt+Shift+Arrow for one sibling step unless editorShortcut is false",()=>{
  const t=fixture();try{
   const event=key(t.dom.surface,"ArrowDown",{altKey:true,shiftKey:true});expect(event.defaultPrevented).toBe(true);
   expect(t.commands).toEqual([{kind:"moveBlock",data:{block:"a",parent:null,before:"L"}}]);
   key(t.dom.surface,"ArrowUp",{altKey:true,shiftKey:true});expect(t.top()).toEqual(["a","b","L","Q","c"]);
   key(t.dom.surface,"ArrowUp",{altKey:true,shiftKey:true});expect(t.commands).toHaveLength(2);expect(t.drag.layer.textContent).toContain("edge of its container");
  }finally{t.dispose();}
  const off=fixture({editorShortcut:false});try{
   const event=key(off.dom.surface,"ArrowDown",{altKey:true,shiftKey:true});
   expect(event.defaultPrevented).toBe(false);expect(off.commands).toEqual([]);
   expect(off.drag.step("a",1)).toBe(true);expect(off.top()[0]).toBe("b");
  }finally{off.dispose();}
 });
 it("supports keyboard move mode on the focused handle",()=>{
  const t=fixture();try{
   pointer(t.element("i1p"),"pointermove");expect(t.drag.activeBlock()).toBe("i1");t.drag.handle.focus();
   key(t.drag.handle,"Enter");expect(t.drag.handle.getAttribute("aria-pressed")).toBe("true");
   key(t.drag.handle,"ArrowDown");key(t.drag.handle,"Enter");
   expect(t.commands).toEqual([{kind:"moveBlock",data:{block:"i1",parent:"L",before:null}}]);
  }finally{t.dispose();}
 });
 it("refuses rather than queues while composing, and closes an open typing group first",()=>{
  const onReject=vi.fn(),t=fixture({onReject},{natural:true});try{
   t.dom.surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true,data:""}));
   expect(t.dom.contextUiState().composing).toBe(true);
   expect(t.drag.step("a",1)).toBe(false);expect(t.commands).toEqual([]);expect(onReject).toHaveBeenCalledWith({block:"a",reason:"native"});
  }finally{t.dispose();}
  const n=fixture({},{natural:true});try{
   n.closeTypingGroup.mockClear();
   expect(n.drag.step("a",1)).toBe(true);expect(n.closeTypingGroup).toHaveBeenCalledOnce();
   const executed=(n.core.execute as ReturnType<typeof vi.fn>).mock.invocationCallOrder.at(-1)!;
   expect(n.closeTypingGroup.mock.invocationCallOrder[0]!).toBeLessThan(executed);
  }finally{n.dispose();}
 });
 it("hides the handle and refuses moves while read-only",()=>{
  const onReject=vi.fn(),t=fixture({onReject},{readOnly:true});try{
   pointer(t.element("b"),"pointermove");expect(t.drag.handle.hidden).toBe(true);
   expect(t.drag.move("a",{anchor:"c",side:"after"})).toBe(false);expect(t.commands).toEqual([]);
   expect(onReject).toHaveBeenCalledWith({block:"a",reason:"read_only"});
  }finally{t.dispose();}
 });
 it("disposes its layer and listeners",()=>{
  const t=fixture();t.drag.dispose();expect(t.host.querySelector(".breditor-block-drag")).toBeNull();
  key(t.dom.surface,"ArrowDown",{altKey:true,shiftKey:true});expect(t.commands).toEqual([]);t.dom.dispose();
 });
});
