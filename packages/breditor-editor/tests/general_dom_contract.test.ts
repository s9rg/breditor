import {afterEach,describe,expect,it,vi} from "vitest";
import {RichDomEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {SharedDomEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import {model,type ElementNode} from "../../breditor-experimental-rich-content/src/model.js";
import {readNative,restoreNative} from "../../breditor-experimental-rich-content/src/selection.js";
import type {RichCoreEditor,RichView,RichSelection} from "../../breditor-experimental-rich-content/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
const point=(block:string,offset="1",affinity:"after"|"before"="after")=>({block,offset,affinity});
const range=(anchor=point("a"),focus=point("b","2")):Extract<RichSelection,{kind:"text"}>=>({kind:"text",anchor,focus});
const element=(type:string,block:string,children:unknown[]=[],properties:Record<string,unknown>={})=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block,...properties},children});
const paragraph=(block:string)=>element("paragraph",block,[{kind:"text",text:"seed",formats:[]}]);
const documentJson=JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/dom",version:1},schemaFingerprint:"native fixture",root:element("document","root",[paragraph("a"),paragraph("b")])});
function fixture(mode:"local"|"shared",general=true,natural=false,selection:RichSelection=range()){
 let revision=1;const calls:{kind:string;data:Record<string,unknown>}[]=[];
 const view=()=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[],...(natural?{historyGrouping:"typing-v1"}:{}),...(mode==="shared"&&general?{rangeEditing:"general-v1"}:{})} as RichView);
 const changed=(kind:string,data:Record<string,unknown>={})=>{calls.push({kind,data});revision++;return true;};
 const host=document.createElement("div");document.body.append(host);
 if(mode==="local"){
  const core={view,supportsGeneralRanges:()=>true,supportsTypingHistory:()=>true,closeTypingGroup:()=>false,execute:vi.fn(command=>{if(command.kind==="setSelection"){selection=command.selection;revision++;return "selection";}changed(command.kind,command.data??{});return "content";}),dispose:vi.fn()} as unknown as RichCoreEditor;
  const dom=new RichDomEditor(host,{core,toolbar:[],...(general?{rangeEditing:"general-v1"}:{})});return {dom,calls,host,core};
 }
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>({view_json:()=>JSON.stringify({...view(),format:"breditor/shared-rich-view"}),free:()=>{}}),free:vi.fn(),general_range_version:()=>"1",enable_general_ranges:()=>false,general_checkpoint:()=>"general",general_typing_checkpoint:()=>"natural-general",
  replace_general_range_text:(_o:unknown,json:string)=>changed("replaceGeneralRangeText",JSON.parse(json)),replace_general_range_plain_text:(_o:unknown,json:string)=>changed("replaceGeneralRangePlainText",JSON.parse(json)),replace_general_range_typing_text:(_o:unknown,json:string)=>changed("replaceGeneralRangeTypingText",JSON.parse(json)),typing_history_version:()=>"1",enable_typing_history:()=>false,close_typing_group:()=>false,typing_checkpoint:()=>"natural",insert_typing_text:(_o:unknown,json:string)=>changed("insertTypingText",JSON.parse(json)),delete_typing_range:(_o:unknown,json:string)=>changed("deleteTypingRange",JSON.parse(json)),
  set_selection:(_o:unknown,json:string)=>{selection=JSON.parse(json);revision++;return true;},insert_plain_text:(_o:unknown,text:string)=>changed("insertPlainText",{text}),replace_plain_text:(_o:unknown,json:string,text:string)=>changed("replaceTextRange",{selection:JSON.parse(json),text}),insert_hard_break:()=>changed("insertHardBreak")};
 const core=new SharedRichEditor(raw as unknown as SharedRustOwner),dom=new SharedDomEditor(host,{core,toolbar:[]});return {dom,calls,host,core};
}
function input(dom:RichDomEditor|SharedDomEditor,type:string,text:string|null=null,target?:Extract<RichSelection,{kind:"text"}>){
 const event=new InputEvent("beforeinput",{inputType:type,data:text,bubbles:true,cancelable:true});
 if(target){const get=(block:string)=>dom.surface.querySelector<HTMLElement>(`[data-rich-text="${block}"]`)!.firstChild!;Object.defineProperty(event,"getTargetRanges",{value:()=>[{startContainer:get(target.anchor.block),startOffset:Number(target.anchor.offset),endContainer:get(target.focus.block),endOffset:Number(target.focus.offset)}]});}
 dom.surface.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
}
afterEach(()=>{document.getSelection()?.removeAllRanges();document.body.replaceChildren();vi.restoreAllMocks();});
describe("guarded general DOM routing (synthetic events, not browser acceptance)",()=>{
 for(const mode of ["local","shared"] as const){
  it(`${mode}: explicit general plain input and Shift-Enter retain closed native targets`,()=>{
   const t=fixture(mode);try{
    for(const type of ["insertText","insertReplacementText","insertLineBreak","deleteContentBackward","deleteContentForward"]){input(t.dom,type,"Q");expect(t.calls.at(-1)).toMatchObject({kind:"replaceGeneralRangePlainText",data:{selection:range(),text:type.startsWith("delete")?"":type==="insertLineBreak"?"\n":"Q"}});}
    const event=new KeyboardEvent("keydown",{key:"Enter",shiftKey:true,bubbles:true,cancelable:true});t.dom.surface.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);expect(t.calls.at(-1)).toMatchObject({kind:"replaceGeneralRangePlainText",data:{selection:range(),text:"\n"}});expect(new Set(t.calls.map(call=>call.data["prefix"])).size).toBe(t.calls.length);
   }finally{t.dom.dispose();}
  });
  it(`${mode}: browser replacement target does not require publishing a temporary selection`,()=>{
   const actual=range(point("b","1"),point("b","1")),target=range(point("a","0"),point("b","3")),t=fixture(mode,true,true,actual);try{input(t.dom,"insertText","Q🙂",target);expect(t.calls).toHaveLength(1);expect(t.calls[0]).toMatchObject({kind:"replaceGeneralRangeTypingText",data:{selection:target,text:"Q🙂",clockMs:expect.stringMatching(/^\d+$/)}});}finally{t.dom.dispose();}
  });
  it(`${mode}: browser caret targets retain logical before-affinity for native continuation`,()=>{
   const caret=range(point("a","1","before"),point("a","1","before")),t=fixture(mode,true,true,caret);try{input(t.dom,"insertText","Q",range(point("a"),point("a")));expect(t.calls.at(-1)).toMatchObject({kind:"replaceGeneralRangeTypingText",data:{selection:caret}});}finally{t.dom.dispose();}
  });
  it(`${mode}: ordinary adjacent natural deletion keeps its original native grouping`,()=>{
   const t=fixture(mode,true,true,range(point("a","2"),point("a","2")));try{input(t.dom,"deleteContentBackward",null,range(point("a","1"),point("a","2")));expect(t.calls.at(-1)).toMatchObject({kind:"deleteTypingRange",data:{direction:"backward"}});}finally{t.dom.dispose();}
  });
  it(`${mode}: plain paste uses the general path and an empty transfer never deletes`,()=>{
   const t=fixture(mode);try{for(const plain of ["pasted",""]){const event=new Event("paste",{bubbles:true,cancelable:true});Object.defineProperty(event,"clipboardData",{value:{files:[],getData:(type:string)=>type==="text/plain"?plain:""}});t.dom.surface.dispatchEvent(event);}expect(t.calls).toHaveLength(1);expect(t.calls[0]).toMatchObject({kind:"replaceGeneralRangePlainText",data:{selection:range(),text:"pasted"}});}finally{t.dom.dispose();}
  });
  it(`${mode}: original input routes remain unchanged without a general opt-in`,()=>{
   const t=fixture(mode,false);try{input(t.dom,"insertReplacementText","Q");expect(t.calls.at(-1)?.kind).toBe("insertPlainText");expect(t.calls.some(c=>c.kind.startsWith("replaceGeneral"))).toBe(false);}finally{t.dom.dispose();}
  });
 }
 it("rejects unsupported local opt-in and unknown policy before publishing any host DOM",()=>{
  const host=document.createElement("div"),original=document.createElement("button");host.append(original);const core={supportsGeneralRanges:()=>false} as RichCoreEditor;
  expect(()=>new RichDomEditor(host,{core,rangeEditing:"general-v1"})).toThrow("matching native general-range");expect(host.firstChild).toBe(original);expect(()=>new RichDomEditor(host,{core,rangeEditing:"auto" as "general-v1"})).toThrow("rangeEditing original or general-v1");expect(host.firstChild).toBe(original);
 });
 it("preserves backward cross-cell text endpoints only in general mode; explicit grid selection is separate",()=>{
  const table=element("table","table",[element("table-row","row",[element("table-cell","cell-a",[paragraph("a")],{"breditor/column-id":"c1"}),element("table-cell","cell-b",[paragraph("b")],{"breditor/column-id":"c2"})],{"breditor/row-id":"r"})],{"breditor/table-id":"t"});
  const source=fixture("local");try{const view=source.core.view(),projection=model({...view,documentJson:JSON.stringify({schema:{name:"test/dom",version:1},schemaFingerprint:"fixture",root:element("document","root",[table])})}),surface=document.createElement("div");for(const block of ["a","b"]){const p=document.createElement("p");p.dataset["richText"]=block;p.textContent="seed";surface.append(p);}document.body.append(surface);
   for(const backward of [false,true]){const target=backward?range(point("b","3","before"),point("a","1")):range(point("a","1"),point("b","3","before"));const current={...projection,view:{...projection.view,selection:target}};restoreNative(surface,target);expect(readNative(surface,current,"original")?.kind).toBe("grid");expect(readNative(surface,current,"general-v1")).toEqual(target);expect(readNative(surface,{...current,view:{...current.view,rangeEditing:"general-v1"}})).toEqual(target);}
   // Projections are read-only. The bridge never changes the native view into a text selection.
   expect(projection.root.type).toBe("breditor/document");expect((projection.root.children[0] as ElementNode).type).toBe("breditor/table");
  }finally{source.dom.dispose();}
 });
});
