import {afterEach,describe,expect,it,vi} from "vitest";
import {mountSharedEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedRustOwner,RichSelection} from "../../breditor-collaboration/src/types.js";
import {sharedPresentationModel} from "../../breditor-collaboration/src/document_presentation.js";
import {mountSharedBlockDrag,type SharedBlockDragOptions} from "../../breditor-collaboration/src/block_drag.js";
import {resolveSharedBlockMove,resolveSharedBlockStep,sharedBlockDropTargets,sharedSelectionBlock,isMovableBlock} from "../../breditor-collaboration/src/block_move.js";

type N={kind:"element";type:string;properties:Record<string,unknown>;children:(N|{kind:"text";text:string;formats:[]})[]};
const el=(type:string,block:string,children:N["children"]=[],extra:Record<string,unknown>={}):N=>({kind:"element",type:`breditor/${type}`,properties:{"breditor/block-id":block,...extra},children});
const p=(block:string)=>el("paragraph",block,[{kind:"text",text:block,formats:[]}]);
/** a, b, list L [i1 [i1p], i2 [i2p, nested list N [n1 [n1p]]]], quote Q [q1], image IMG [cap], c */
function tree():N{
 return {kind:"element",type:"breditor/document",properties:{"breditor/document-id":"room"},children:[
  p("a"),p("b"),
  el("bullet-list","L",[el("list-item","i1",[p("i1p")]),el("list-item","i2",[p("i2p"),el("bullet-list","N",[el("list-item","n1",[p("n1p")])])])]),
  el("blockquote","Q",[p("q1")]),
  el("image","IMG",[p("cap")],{"breditor/image-id":"img","breditor/asset-id":"asset","breditor/asset-generation":"1","breditor/alt-text":"","breditor/decorative":false}),
  p("c"),
 ]};
}
const caret=(block:string):RichSelection=>({kind:"text",anchor:{block,offset:"0",affinity:"after"},focus:{block,offset:"0",affinity:"after"}});
function viewOf(root:N,revision=0,selection:RichSelection|null=null,readOnly=false){
 return {format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),documentJson:JSON.stringify({schema:{name:"test/block-drag",version:1},schemaFingerprint:"fixture",root}),selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:1000,grid:null,tables:[],...(readOnly?{readOnly:true,readOnlyRevision:"1"}:{})};
}
const modelOf=(root=tree(),selection:RichSelection|null=null,readOnly=false)=>sharedPresentationModel(viewOf(root,0,selection,readOnly) as never,"original");

describe("semantic block move planning",()=>{
 const m=modelOf();
 it("reorders siblings with the retained-ID move_block command",()=>{
  expect(resolveSharedBlockMove(m,"a",{anchor:"b",side:"after"})).toEqual({kind:"move",parent:null,before:"L",command:{kind:"move_block",data:{block:"a",parent:null,before:"L"}}});
  expect(resolveSharedBlockMove(m,"a",{anchor:"c",side:"after"})).toMatchObject({kind:"move",before:null});
  expect(resolveSharedBlockMove(m,"i2",{anchor:"i1",side:"before"})).toMatchObject({kind:"move",parent:"L",before:"i1"});
 });
 it("treats in-place drops as unchanged",()=>{
  expect(resolveSharedBlockMove(m,"a",{anchor:"a",side:"after"})).toEqual({kind:"unchanged"});
  expect(resolveSharedBlockMove(m,"a",{anchor:"b",side:"before"})).toEqual({kind:"unchanged"});
  expect(resolveSharedBlockMove(m,"b",{anchor:"a",side:"after"})).toEqual({kind:"unchanged"});
 });
 it("rejects cross-container targets unless flow-v1 admits them",()=>{
  expect(resolveSharedBlockMove(m,"a",{anchor:"q1",side:"before"})).toEqual({kind:"rejected",reason:"cross_container"});
  expect(resolveSharedBlockMove(m,"a",{anchor:"q1",side:"before"},"flow-v1")).toMatchObject({kind:"move",parent:"Q",before:"q1"});
  expect(resolveSharedBlockMove(m,"i1",{anchor:"a",side:"after"},"flow-v1")).toEqual({kind:"rejected",reason:"grammar"});
  expect(resolveSharedBlockMove(m,"a",{anchor:"i1",side:"after"},"flow-v1")).toEqual({kind:"rejected",reason:"grammar"});
 });
 it("rejects cyclic targets inside the moved subtree",()=>{
  for(const policy of ["sibling-v1","flow-v1"] as const){
   expect(resolveSharedBlockMove(m,"L",{anchor:"n1p",side:"before"},policy)).toEqual({kind:"rejected",reason:"cyclic"});
   expect(resolveSharedBlockMove(m,"Q",{anchor:"q1",side:"after"},policy)).toEqual({kind:"rejected",reason:"cyclic"});
  }
 });
 it("rejects grammar violations the native group would refuse",()=>{
  expect(resolveSharedBlockMove(m,"q1",{anchor:"a",side:"before"},"flow-v1")).toEqual({kind:"rejected",reason:"empties_source"});
  expect(resolveSharedBlockMove(m,"N",{anchor:"i2p",side:"before"})).toEqual({kind:"rejected",reason:"item_lead"});
  expect(resolveSharedBlockMove(m,"i2p",{anchor:"a",side:"after"},"flow-v1")).toEqual({kind:"rejected",reason:"item_lead"});
  expect(resolveSharedBlockMove(m,"cap",{anchor:"a",side:"after"},"flow-v1")).toEqual({kind:"rejected",reason:"not_movable"});
  expect(resolveSharedBlockMove(m,"a",{anchor:"cap",side:"after"},"flow-v1")).toEqual({kind:"rejected",reason:"invalid_target"});
  expect(resolveSharedBlockMove(m,"a",{anchor:"missing",side:"after"})).toEqual({kind:"rejected",reason:"unknown_block"});
  expect(resolveSharedBlockMove(modelOf(tree(),null,true),"a",{anchor:"c",side:"after"})).toEqual({kind:"rejected",reason:"read_only"});
  expect(isMovableBlock(m,"cap")).toBe(false);expect(isMovableBlock(m,"IMG")).toBe(true);
 });
 it("steps one sibling slot and stops at container edges",()=>{
  expect(resolveSharedBlockStep(m,"i2",-1)).toMatchObject({kind:"move",parent:"L",before:"i1"});
  expect(resolveSharedBlockStep(m,"i1",1)).toMatchObject({kind:"move",parent:"L",before:null});
  expect(resolveSharedBlockStep(m,"i1",-1)).toEqual({kind:"rejected",reason:"boundary"});
  expect(resolveSharedBlockStep(m,"c",1)).toEqual({kind:"rejected",reason:"boundary"});
 });
 it("lists each admitted distinct destination once",()=>{
  const sibling=sharedBlockDropTargets(m,"a").map(t=>t.before);
  expect(sibling).toEqual(["L","Q","IMG","c",null]);
  const flow=sharedBlockDropTargets(m,"a","flow-v1");
  expect(flow.some(t=>t.parent==="Q")).toBe(true);expect(flow.some(t=>t.parent==="i1")).toBe(true);expect(flow.some(t=>t.parent==="L")).toBe(false);
  expect(new Set(flow.map(t=>JSON.stringify([t.parent,t.before]))).size).toBe(flow.length);
 });
 it("maps a caret on an item's lead line to the item",()=>{
  expect(sharedSelectionBlock(modelOf(tree(),caret("i1p")))).toBe("i1");
  expect(sharedSelectionBlock(modelOf(tree(),caret("q1")))).toBe("q1");
  expect(sharedSelectionBlock(modelOf(tree(),caret("n1p")))).toBe("n1");
 });
});

function moveIn(root:N,block:string,parent:string|null,before:string|null):void{
 const find=(node:N,key:string|null):N|undefined=>{if(key===null)return root;if(node.properties["breditor/block-id"]===key)return node;for(const child of node.children)if(child.kind==="element"){const hit=find(child,key);if(hit)return hit;}return undefined;};
 const detach=(node:N):N|undefined=>{const index=node.children.findIndex(c=>c.kind==="element"&&c.properties["breditor/block-id"]===block);if(index>=0)return node.children.splice(index,1)[0] as N;for(const child of node.children)if(child.kind==="element"){const hit=detach(child);if(hit)return hit;}return undefined;};
 const moved=detach(root)!,target=find(root,parent)!,index=before===null?target.children.length:target.children.findIndex(c=>c.kind==="element"&&c.properties["breditor/block-id"]===before);
 target.children.splice(index,0,moved);
}
function fixture(options:SharedBlockDragOptions={},{reject=false,readOnly=false}={}){
 let root=tree(),revision=0,selection:RichSelection|null=caret("a");const undo:string[]=[];const dispatched:unknown[]=[];
 const view=()=>({...viewOf(root,revision,selection,readOnly),undoDepth:undo.length});
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>{const frozen=JSON.stringify(view());return {view_json:()=>frozen,free:()=>{}};},free:vi.fn(),
  dispatch:vi.fn((_o:unknown,input:string)=>{const request=JSON.parse(input) as {commands:{kind:string;data:{block:string;parent:string|null;before:string|null}}[]};dispatched.push(request);if(reject)throw Error("local move conflicts with rich grammar");
   const before=JSON.stringify(root),candidate=JSON.parse(before) as N;for(const command of request.commands){if(command.kind!=="move_block")throw Error("unexpected command");moveIn(candidate,command.data.block,command.data.parent,command.data.before);}
   undo.push(before);root=candidate;revision++;return true;}),
  undo_observed:vi.fn(()=>{const previous=undo.pop();if(previous===undefined)return false;root=JSON.parse(previous) as N;revision++;return true;}),redo_observed:vi.fn(()=>false),
  set_selection:vi.fn((_o:unknown,input:string)=>{selection=JSON.parse(input) as RichSelection|null;revision++;return true;}),
  set_pending_formats:vi.fn(),insert_plain_text:vi.fn(),navigate_grid:vi.fn(()=>JSON.stringify({kind:"unchanged"})),receive_frame:vi.fn(),copy_clipboard:vi.fn()};
 const core=new SharedRichEditor(raw as unknown as SharedRustOwner),host=document.createElement("div");document.body.append(host);
 const errors:unknown[]=[];const dom=mountSharedEditor(host,{core,coreOwnership:"borrow",toolbar:[],onError:e=>errors.push(e)} as never);
 const drag=mountSharedBlockDrag(dom,options);
 const order=(node:N=root):string[]=>node.children.flatMap(c=>c.kind==="element"?[String(c.properties["breditor/block-id"]),...order(c)]:[]);
 const element=(block:string)=>[...dom.surface.querySelectorAll<HTMLElement>("[data-rich-block]")].find(e=>e.dataset["richBlock"]===block)!;
 return {raw,core,dom,drag,host,errors,dispatched,order,element,top:()=>root.children.map(c=>String((c as N).properties["breditor/block-id"])),dispose(){drag.dispose();dom.dispose();core.dispose();}};
}
const pointer=(target:EventTarget,type:string,init:{clientX?:number;clientY?:number;button?:number;pointerId?:number}={})=>{const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:init.clientX??0,clientY:init.clientY??0,button:init.button??0});Object.defineProperty(event,"pointerId",{value:init.pointerId??1});target.dispatchEvent(event);return event;};
const key=(target:EventTarget,k:string,init:KeyboardEventInit={})=>{const event=new KeyboardEvent("keydown",{key:k,bubbles:true,cancelable:true,...init});target.dispatchEvent(event);return event;};
function rect(element:HTMLElement,top:number,height=20){element.getBoundingClientRect=()=>({top,bottom:top+height,left:40,right:440,width:400,height,x:40,y:top,toJSON(){return this;}}) as DOMRect;}
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();delete (document as {elementFromPoint?:unknown}).elementFromPoint;});

describe("SharedBlockDrag DOM handle",()=>{
 it("shows one hover handle and drops through one move_block dispatch and one Undo",()=>{
  const t=fixture();try{
   pointer(t.element("b"),"pointermove");expect(t.drag.activeBlock()).toBe("b");expect(t.drag.handle.hidden).toBe(false);
   const target=t.element("c");rect(target,100);(document as {elementFromPoint?:unknown}).elementFromPoint=()=>target.firstChild!.parentElement;
   pointer(t.drag.handle,"pointerdown");expect(t.drag.layer.hasAttribute("data-dragging")).toBe(true);
   pointer(window,"pointermove",{clientY:115});expect(t.drag.indicator.hidden).toBe(false);expect(t.drag.indicator.dataset["state"]).toBe("valid");expect(t.drag.indicator.style.top).toBe("119px");
   pointer(window,"pointerup",{clientY:115});
   expect(t.dispatched).toEqual([{commands:[{kind:"move_block",data:{block:"b",parent:null,before:null}}]}]);
   expect(t.top()).toEqual(["a","L","Q","IMG","c","b"]);expect(t.drag.indicator.hidden).toBe(true);
   key(t.dom.surface,"z",{ctrlKey:true});expect(t.raw.undo_observed).toHaveBeenCalledTimes(1);expect(t.top()).toEqual(["a","b","L","Q","IMG","c"]);
  }finally{t.dispose();}
 });
 it("climbs from a nested pointer target to the deepest admitted anchor",()=>{
  const t=fixture();try{
   pointer(t.element("a"),"pointermove");const q1=t.element("q1"),quote=t.element("Q");rect(q1,200);rect(quote,190,40);
   (document as {elementFromPoint?:unknown}).elementFromPoint=()=>q1;
   pointer(t.drag.handle,"pointerdown");pointer(window,"pointermove",{clientY:200});pointer(window,"pointerup",{clientY:200});
   expect(t.dispatched).toEqual([{commands:[{kind:"move_block",data:{block:"a",parent:null,before:"Q"}}]}]);
  }finally{t.dispose();}
 });
 it("shows an invalid indicator and publishes nothing for cross-container drops",()=>{
  const onReject=vi.fn(),t=fixture({onReject});try{
   pointer(t.element("i1p"),"pointermove");expect(t.drag.activeBlock()).toBe("i1");
   const a=t.element("a");rect(a,10);(document as {elementFromPoint?:unknown}).elementFromPoint=()=>a;
   pointer(t.drag.handle,"pointerdown");pointer(window,"pointermove",{clientY:12});
   expect(t.drag.indicator.dataset["state"]).toBe("invalid");expect(t.drag.layer.dataset["dropRejected"]).toBe("cross_container");
   pointer(window,"pointerup",{clientY:12});expect(t.raw.dispatch).not.toHaveBeenCalled();expect(onReject).toHaveBeenCalledWith({block:"i1",reason:"cross_container"});
  }finally{t.dispose();}
 });
 it("cancels a pointer drag with Escape",()=>{
  const t=fixture();try{
   pointer(t.element("b"),"pointermove");const c=t.element("c");rect(c,100);(document as {elementFromPoint?:unknown}).elementFromPoint=()=>c;
   pointer(t.drag.handle,"pointerdown");pointer(window,"pointermove",{clientY:115});key(window,"Escape");pointer(window,"pointerup",{clientY:115});
   expect(t.raw.dispatch).not.toHaveBeenCalled();expect(t.drag.layer.hasAttribute("data-dragging")).toBe(false);
  }finally{t.dispose();}
 });
 it("reserves Alt+Shift+Arrow in the surface for one sibling step",()=>{
  const t=fixture();try{
   const event=key(t.dom.surface,"ArrowDown",{altKey:true,shiftKey:true});expect(event.defaultPrevented).toBe(true);
   expect(t.dispatched).toEqual([{commands:[{kind:"move_block",data:{block:"a",parent:null,before:"L"}}]}]);
   key(t.dom.surface,"ArrowUp",{altKey:true,shiftKey:true});expect(t.top()).toEqual(["a","b","L","Q","IMG","c"]);
   key(t.dom.surface,"ArrowUp",{altKey:true,shiftKey:true});expect(t.raw.dispatch).toHaveBeenCalledTimes(2);expect(t.drag.layer.textContent).toContain("edge of its container");
  }finally{t.dispose();}
 });
 it("supports a keyboard move mode on the focused handle",()=>{
  const t=fixture();try{
   pointer(t.element("i1p"),"pointermove");t.drag.handle.focus();
   key(t.drag.handle,"Enter");expect(t.drag.handle.getAttribute("aria-pressed")).toBe("true");
   key(t.drag.handle,"ArrowDown");expect(t.drag.indicator.hidden).toBe(false);
   key(t.drag.handle,"Enter");
   expect(t.dispatched).toEqual([{commands:[{kind:"move_block",data:{block:"i1",parent:"L",before:null}}]}]);
   expect(t.order().filter(b=>b==="i1"||b==="i2")).toEqual(["i2","i1"]);
   key(t.drag.handle,"Enter");key(t.drag.handle,"ArrowUp");key(t.drag.handle,"Escape");expect(t.raw.dispatch).toHaveBeenCalledTimes(1);
   key(t.drag.handle,"ArrowUp",{altKey:true,shiftKey:true});expect(t.order().filter(b=>b==="i1"||b==="i2")).toEqual(["i1","i2"]);
  }finally{t.dispose();}
 });
 it("leaves the document untouched when native admission refuses the group",()=>{
  const onReject=vi.fn(),onMove=vi.fn(),t=fixture({onReject,onMove},{reject:true});try{
   expect(t.drag.step("a",1)).toBe(false);expect(t.top()).toEqual(["a","b","L","Q","IMG","c"]);
   expect(onReject).toHaveBeenCalledWith({block:"a",reason:"native"});expect(onMove).not.toHaveBeenCalled();expect(t.errors).toHaveLength(1);
  }finally{t.dispose();}
 });
 it("hides the handle and refuses moves while read-only",()=>{
  const t=fixture({},{readOnly:true});try{
   pointer(t.element("b"),"pointermove");expect(t.drag.handle.hidden).toBe(true);
   expect(t.drag.move("a",{anchor:"c",side:"after"})).toBe(false);expect(t.raw.dispatch).not.toHaveBeenCalled();
  }finally{t.dispose();}
 });
 it("disposes its layer and listeners",()=>{
  const t=fixture();t.drag.dispose();expect(t.host.querySelector(".breditor-block-drag")).toBeNull();
  key(t.dom.surface,"ArrowDown",{altKey:true,shiftKey:true});expect(t.raw.dispatch).not.toHaveBeenCalled();t.dom.dispose();t.core.dispose();
 });
});
