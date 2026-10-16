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
function fixture(mode:"local"|"shared",general=true,natural=false,selection:RichSelection=range(),clipboardCapable=true){
 let revision=1;const calls:{kind:string;data:Record<string,unknown>}[]=[];
 const view=()=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[],...(natural?{historyGrouping:"typing-v1"}:{}),...(mode==="shared"&&general?{rangeEditing:"general-v1"}:{})} as RichView);
 const changed=(kind:string,data:Record<string,unknown>={})=>{calls.push({kind,data});revision++;return true;};
 const host=document.createElement("div");document.body.append(host);
 const clipboard=()=>({plainText:"native general selected text",structuredJson:"native general opaque table shape"});
 if(mode==="local"){
  const core={view,supportsGeneralRanges:()=>true,supportsGeneralFlowPaste:()=>clipboardCapable,supportsGeneralInlinePaste:()=>clipboardCapable,supportsGeneralCopy:()=>clipboardCapable,generalClipboard:clipboard,clipboard:()=>({plainText:"original",structuredJson:"original"}),supportsTypingHistory:()=>true,closeTypingGroup:()=>false,execute:vi.fn(command=>{if(command.kind==="setSelection"){selection=command.selection;revision++;return "selection";}changed(command.kind,command.data??{});return "content";}),dispose:vi.fn()} as unknown as RichCoreEditor;
  const dom=new RichDomEditor(host,{core,toolbar:[],...(general?{rangeEditing:"general-v1"}:{})});return {dom,calls,host,core};
 }
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>({view_json:()=>JSON.stringify({...view(),format:"breditor/shared-rich-view"}),free:()=>{}}),free:vi.fn(),general_range_version:()=>"1",enable_general_ranges:()=>false,general_checkpoint:()=>"general",general_typing_checkpoint:()=>"natural-general",
  general_copy_version:()=>clipboardCapable?"1":"0",copy_general_clipboard:()=>JSON.stringify({plainText:clipboard().plainText,richJson:clipboard().structuredJson}),copy_clipboard:()=>JSON.stringify({plainText:"original",richJson:"original"}),
  general_flow_paste_version:()=>clipboardCapable?"1":"0",paste_general_flow_clipboard:(_o:unknown,json:string)=>changed("pasteGeneralFlowClipboard",JSON.parse(json)),
  general_inline_paste_version:()=>clipboardCapable?"1":"0",paste_general_inline_clipboard:(_o:unknown,json:string)=>changed("pasteGeneralInlineClipboard",JSON.parse(json)),replace_general_range_text:(_o:unknown,json:string)=>changed("replaceGeneralRangeText",JSON.parse(json)),replace_general_range_plain_text:(_o:unknown,json:string)=>changed("replaceGeneralRangePlainText",JSON.parse(json)),replace_general_range_typing_text:(_o:unknown,json:string)=>changed("replaceGeneralRangeTypingText",JSON.parse(json)),typing_history_version:()=>"1",enable_typing_history:()=>false,close_typing_group:()=>false,typing_checkpoint:()=>"natural",insert_typing_text:(_o:unknown,json:string)=>changed("insertTypingText",JSON.parse(json)),delete_typing_range:(_o:unknown,json:string)=>changed("deleteTypingRange",JSON.parse(json)),
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
  it(`${mode}: cross-range composition commits its final text once, or cancels without deleting`,()=>{
   const frames:FrameRequestCallback[]=[];vi.spyOn(window,"requestAnimationFrame").mockImplementation(callback=>{frames.push(callback);return frames.length;});
   for(const text of ["日本🙂",""]){const t=fixture(mode);try{
    t.dom.surface.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));
    t.dom.surface.querySelector('[data-rich-text="a"]')!.textContent="provisional DOM is not the document";
    t.dom.surface.dispatchEvent(new CompositionEvent("compositionend",{bubbles:true,data:text}));expect(t.calls).toEqual([]);
    frames.shift()!(0);if(text)expect(t.calls).toEqual([{kind:"replaceGeneralRangePlainText",data:{selection:range(),text,prefix:expect.any(String)}}]);else expect(t.calls).toEqual([]);
    expect(t.dom.surface.querySelector('[data-rich-text="a"]')!.textContent).toBe("seed");
   }finally{t.dom.dispose();}}
  });
  it(`${mode}: rich flow remains opaque and uses one general command, with no old-runtime fallback`,()=>{
   for(const capable of [true,false]){const t=fixture(mode,true,false,range(),capable);try{const clipboard=JSON.stringify({kind:"flow",native:"table/list/image tree"}),event=new Event("paste",{bubbles:true,cancelable:true});Object.defineProperty(event,"clipboardData",{value:{files:[],getData:(type:string)=>type==="application/x-breditor-rich+json"?clipboard:"do not flatten"}});t.dom.surface.dispatchEvent(event);if(capable){expect(t.calls).toHaveLength(1);expect(t.calls[0]).toMatchObject({kind:"pasteGeneralFlowClipboard",data:{selection:range(),clipboardJson:clipboard,prefix:expect.any(String),right:expect.any(String)}});}else{expect(t.calls).toEqual([]);expect(t.dom.status.textContent).toContain("matching native general rich-flow clipboard");}}finally{t.dom.dispose();}}
  });
  it(`${mode}: general Copy is a pure native read and Cut publishes one native general deletion only after retention`,()=>{
   for(const [capable,retain] of [[true,true],[true,false],[false,true]]){const t=fixture(mode,true,false,range(),capable);try{
    for(const cut of [false,true]){const values=new Map<string,string>(),event=new Event(cut?"cut":"copy",{bubbles:true,cancelable:true});Object.defineProperty(event,"clipboardData",{value:{get types(){return [...values.keys()];},setData:(type:string,value:string)=>{if(retain)values.set(type,value);},getData:(type:string)=>values.get(type)??""}});t.dom.surface.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
     if(capable&&retain){expect(values.get("text/plain")).toBe("native general selected text");expect(values.get("application/x-breditor-rich+json")).toBe("native general opaque table shape");if(cut)expect(t.calls).toEqual([{kind:"replaceGeneralRangePlainText",data:{selection:range(),text:"",prefix:expect.any(String)}}]);else expect(t.calls).toEqual([]);}else {expect(t.calls).toEqual([]);expect(t.dom.status.textContent).toContain(capable?"Clipboard did not retain":"matching native general clipboard copy");}
    }
   }finally{t.dom.dispose();}}
  });
  it(`${mode}: inline rich paste retains the opaque clipboard for Rust and never falls back on an older runtime`,()=>{
   const clipboard=JSON.stringify({kind:"text",opaque:"native validates every field"});
   for(const capable of [true,false]){const t=fixture(mode,true,false,range(),capable);try{const event=new Event("paste",{bubbles:true,cancelable:true});Object.defineProperty(event,"clipboardData",{value:{files:[],getData:(type:string)=>type==="application/x-breditor-rich+json"?clipboard:"must not become plain fallback"}});t.dom.surface.dispatchEvent(event);if(capable)expect(t.calls).toEqual([{kind:"pasteGeneralInlineClipboard",data:{selection:range(),clipboardJson:clipboard,prefix:expect.any(String)}}]);else {expect(t.calls).toEqual([]);expect(t.dom.status.textContent).toContain("matching native general inline clipboard");}}finally{t.dom.dispose();}}
  });
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
