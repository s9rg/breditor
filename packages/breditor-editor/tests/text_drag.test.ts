import {afterEach,describe,expect,it,vi} from "vitest";
import {RichDomEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {resolveRichTextDrop,richTextDropEffect,richTextDropRuns} from "../../breditor-experimental-rich-content/src/text_drag.js";
import {model} from "../../breditor-experimental-rich-content/src/model.js";
import type {RichCoreEditor,RichView,RichSelection,RichCommand} from "../../breditor-experimental-rich-content/src/core.js";
import {mountSharedEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
import {sharedTextDrop} from "../../breditor-collaboration/src/text_drop.js";

// Native state is stubbed: these are DOM/planner contracts. The real Rust admission is covered by
// crates/breditor-wasm/tests/rich_drop_text.rs and the release-Wasm browser probe in
// experiments/rich-browser/text-drag.spec.mjs.
type Run={kind:"text";text:string;formats:{type:string;properties:Record<string,unknown>}[]};
type N={kind:"element";type:string;entityId:null;properties:Record<string,unknown>;children:(N|Run)[]};
const strong={type:"breditor/strong",properties:{}};
const el=(type:string,block:string,children:N["children"]):N=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block},children});
const t=(text:string,formats:Run["formats"]=[]):Run=>({kind:"text",text,formats});
/** p: "ab" + strong "cd" + "ef"; q: "xyz"; c: code "code". */
function tree():N{const root=el("document","root",[el("paragraph","p",[t("ab"),t("cd",[strong]),t("ef")]),el("paragraph","q",[t("xyz")]),el("code-block","c",[t("code")])]);root.properties={"breditor/document-id":"room"};return root;}
const point=(block:string,offset:number)=>({block,offset:String(offset),affinity:"after" as const});
const range=(block:string,start:number,end:number):Extract<RichSelection,{kind:"text"}>=>({kind:"text",anchor:point(block,start),focus:point(block,end)});
const view=(root:N,revision:number,selection:RichSelection|null,readOnly=false):RichView=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson:JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/text-drag",version:1},schemaFingerprint:"fixture",root}),selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[],...(readOnly?{readOnly:true,readOnlyRevision:"1"}:{})} as RichView);

class Transfer {
 #data=new Map<string,string>();files:File[]=[];effectAllowed="uninitialized";dropEffect="none";
 constructor(files:File[]=[]){this.files=files;}
 get types():string[]{return [...this.#data.keys(),...(this.files.length?["Files"]:[])];}
 setData(type:string,value:string):void{this.#data.set(type,value);}
 clearData():void{this.#data.clear();}
 getData(type:string):string{return this.#data.get(type)??"";}
}
function drag(target:EventTarget,type:string,data:Transfer,init:{x?:number;altKey?:boolean;ctrlKey?:boolean}={}):Event{
 const event=new Event(type,{bubbles:true,cancelable:true});
 for(const [key,value] of Object.entries({dataTransfer:data,clientX:init.x??0,clientY:5,altKey:init.altKey??false,ctrlKey:init.ctrlKey??false,relatedTarget:null}))Object.defineProperty(event,key,{value});
 target.dispatchEvent(event);return event;
}
/** caretPositionFromPoint stub: x encodes `block:offset` positions in `positions`. */
function caretAt(surface:HTMLElement,positions:readonly (readonly [string,number])[]):void{
 (document as {caretPositionFromPoint?:unknown}).caretPositionFromPoint=(x:number)=>{
  const entry=positions[x];if(!entry)return null;const [block,offset]=entry;
  const element=[...surface.querySelectorAll<HTMLElement>("[data-rich-text]")].find(e=>e.dataset["richText"]===block)!;
  let remaining=offset;const walker=document.createTreeWalker(element,4);for(let node=walker.nextNode();node;node=walker.nextNode()){const length=node.textContent!.length;if(remaining<=length)return {offsetNode:node,offset:remaining};remaining-=length;}
  return {offsetNode:element,offset:0};
 };
}
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();delete (document as {caretPositionFromPoint?:unknown}).caretPositionFromPoint;});

describe("inline drop planning",()=>{
 const m=model(view(tree(),1,range("p",2,4)));
 it("moves single-block ranges and treats its own edges as unchanged",()=>{
  expect(resolveRichTextDrop(m,m.view.selection,point("q",1),"move")).toEqual({kind:"drop",drop:{source:range("p",2,4),target:point("q",1),effect:"move"}});
  expect(resolveRichTextDrop(m,m.view.selection,point("p",2),"move")).toEqual({kind:"unchanged"});
  expect(resolveRichTextDrop(m,m.view.selection,point("p",4),"move")).toEqual({kind:"unchanged"});
  expect(resolveRichTextDrop(m,m.view.selection,point("p",4),"copy")).toMatchObject({kind:"drop"});
 });
 it("rejects drops into the source, multi-block sources, read-only views and incompatible containers",()=>{
  expect(resolveRichTextDrop(m,m.view.selection,point("p",3),"move")).toEqual({kind:"rejected",reason:"inside_source"});
  expect(resolveRichTextDrop(m,m.view.selection,point("p",3),"copy")).toEqual({kind:"rejected",reason:"inside_source"});
  expect(resolveRichTextDrop(m,{kind:"text",anchor:point("p",1),focus:point("q",1)},point("q",3),"move")).toEqual({kind:"rejected",reason:"source"});
  expect(resolveRichTextDrop(m,range("p",1,1),point("q",3),"move")).toEqual({kind:"rejected",reason:"source"});
  expect(resolveRichTextDrop(m,{kind:"node",block:"p"},point("q",3),"move")).toEqual({kind:"rejected",reason:"source"});
  expect(resolveRichTextDrop(m,m.view.selection,point("missing",0),"move")).toEqual({kind:"rejected",reason:"not_editable"});
  expect(resolveRichTextDrop(m,range("p",1,3),point("c",1),"move")).toEqual({kind:"rejected",reason:"incompatible"});
  expect(resolveRichTextDrop(m,range("p",0,2),point("c",1),"move")).toMatchObject({kind:"drop"});
  expect(resolveRichTextDrop(model(view(tree(),1,range("p",2,4),true)),range("p",2,4),point("q",0),"move")).toEqual({kind:"rejected",reason:"read_only"});
 });
 it("slices exact runs and picks the platform copy modifier",()=>{
  expect(richTextDropRuns(m,range("p",3,1))).toEqual([{text:"b",formats:[]},{text:"c",formats:[strong]}]);
  expect(richTextDropEffect({altKey:true,ctrlKey:false},"MacIntel")).toBe("copy");
  expect(richTextDropEffect({altKey:false,ctrlKey:true},"MacIntel")).toBe("move");
  expect(richTextDropEffect({altKey:false,ctrlKey:true},"Win32")).toBe("copy");
  expect(richTextDropEffect({altKey:true,ctrlKey:false},"Win32")).toBe("move");
 });
 it("lowers a shared move to one delete-then-insert batch with the mapped target selected",()=>{
  expect(sharedTextDrop(m,{source:range("p",2,4),target:point("p",6),effect:"move"})).toEqual({commands:[
   {kind:"replace_text_range",data:{anchor:point("p",2),focus:point("p",4),runs:[]}},
   {kind:"replace_text_range",data:{anchor:point("p",4),focus:point("p",4),runs:[{text:"cd",formats:[strong]}]}},
  ],selectionUpdate:{kind:"set",value:range("p",4,6)}});
  expect(sharedTextDrop(m,{source:range("p",4,2),target:point("q",1),effect:"copy"})).toEqual({commands:[
   {kind:"replace_text_range",data:{anchor:point("q",1),focus:point("q",1),runs:[{text:"cd",formats:[strong]}]}},
  ],selectionUpdate:{kind:"set",value:range("q",1,3)}});
 });
});

function local({readOnly=false}={}){
 let revision=1,selection:RichSelection|null=range("p",2,4);const root=tree(),commands:{command:RichCommand;expected:string|undefined}[]=[];
 const closeTypingGroup=vi.fn(()=>false);
 const core={view:()=>view(root,revision,selection,readOnly),supportsReadOnly:()=>true,closeTypingGroup,
  clipboard:vi.fn(()=>({format:"breditor/rich-clipboard-transfer",formatVersion:1,kind:"text",structuredJson:'{"kind":"text"}',plainText:"cd"})),
  execute:vi.fn((command:RichCommand,expected?:string)=>{
   if(expected!==undefined&&expected!==String(revision))throw Error("stale native guard");
   commands.push({command,expected});
   if(command.kind==="setSelection"){selection=command.selection;revision++;return "selection";}
   revision++;return "content";
  }),dispose:vi.fn()} as unknown as RichCoreEditor;
 const host=document.createElement("div");document.body.append(host);
 const errors:unknown[]=[],files=vi.fn();const dom=new RichDomEditor(host,{core,toolbar:[],onError:e=>errors.push(e),onFiles:files});
 caretAt(dom.surface,[["q",1],["p",3],["p",6],["p",2]]);
 const cursor=host.querySelector<HTMLElement>(".breditor-text-drop-cursor")!;
 return {core,dom,host,errors,files,commands,cursor,revision:()=>String(revision)};
}

describe("local native inline drag",()=>{
 it("drags the Copy flavors and drops one guarded dropText move",()=>{
  const e=local(),data=new Transfer();
  try{
   expect(e.cursor.getAttribute("aria-hidden")).toBe("true");expect(e.cursor.hasAttribute("inert")).toBe(true);expect(e.cursor.hidden).toBe(true);
   const start=drag(e.dom.surface,"dragstart",data);
   expect(start.defaultPrevented).toBe(false);expect(data.getData("text/plain")).toBe("cd");expect(data.getData("application/x-breditor-rich+json")).toBe('{"kind":"text"}');expect(data.effectAllowed).toBe("copyMove");
   const over=drag(e.dom.surface,"dragover",data,{x:0});
   expect(over.defaultPrevented).toBe(true);expect(data.dropEffect).toBe("move");expect(e.cursor.hidden).toBe(false);expect(e.cursor.dataset["state"]).toBe("valid");
   const revision=e.revision(),drop=drag(e.dom.surface,"drop",data,{x:0});
   expect(drop.defaultPrevented).toBe(true);expect(e.cursor.hidden).toBe(true);
   expect(e.commands).toEqual([{command:{kind:"dropText",data:{source:range("p",2,4),target:point("q",1),effect:"move"}},expected:revision}]);
   expect(e.errors).toEqual([]);
  }finally{e.dom.dispose();}
 });
 it("copies with the platform modifier and never dispatches drops into the source",()=>{
  const e=local(),data=new Transfer(),platform=vi.spyOn(navigator,"platform","get").mockReturnValue("Win32");
  try{
   drag(e.dom.surface,"dragstart",data);
   const inside=drag(e.dom.surface,"dragover",data,{x:1});
   expect(inside.defaultPrevented).toBe(false);expect(data.dropEffect).toBe("none");expect(e.cursor.dataset["state"]).toBe("invalid");expect(e.cursor.dataset["dropRejected"]).toBe("inside_source");
   const blocked=drag(e.dom.surface,"drop",data,{x:1});expect(blocked.defaultPrevented).toBe(true);expect(e.commands).toEqual([]);
   drag(e.dom.surface,"dragstart",data);drag(e.dom.surface,"drop",data,{x:3});expect(e.commands).toEqual([]); // own edge: unchanged
   drag(e.dom.surface,"dragstart",data);drag(e.dom.surface,"dragover",data,{x:2,ctrlKey:true});expect(data.dropEffect).toBe("copy");
   drag(e.dom.surface,"drop",data,{x:2,ctrlKey:true});
   expect(e.commands.map(c=>c.command)).toEqual([{kind:"dropText",data:{source:range("p",2,4),target:point("p",6),effect:"copy"}}]);
   expect(platform).toHaveBeenCalled();
  }finally{e.dom.dispose();}
 });
 it("routes foreign drops through the paste path and files through the file path",()=>{
  const e=local(),text=new Transfer();text.setData("text/plain","new");
  try{
   const over=drag(e.dom.surface,"dragover",text,{x:0});expect(over.defaultPrevented).toBe(true);expect(text.dropEffect).toBe("copy");
   drag(e.dom.surface,"drop",text,{x:0});
   expect(e.commands.map(c=>c.command)).toEqual([{kind:"setSelection",selection:range("q",1,1)},{kind:"insertPlainText",text:"new"}]);
   const file=new File(["x"],"a.png",{type:"image/png"}),files=new Transfer([file]);
   expect(drag(e.dom.surface,"dragover",files,{x:0}).defaultPrevented).toBe(true);
   drag(e.dom.surface,"drop",files,{x:0});expect(e.files).toHaveBeenCalledTimes(1);expect(e.files.mock.calls[0]![0]).toEqual([file]);
  }finally{e.dom.dispose();}
 });
 it("allows only copying out of a read-only editor and refuses drops into it",()=>{
  const e=local({readOnly:true}),data=new Transfer();
  try{
   drag(e.dom.surface,"dragstart",data);expect(data.effectAllowed).toBe("copy");
   const over=drag(e.dom.surface,"dragover",data,{x:0});expect(over.defaultPrevented).toBe(false);expect(e.cursor.dataset["dropRejected"]).toBe("read_only");
   drag(e.dom.surface,"drop",data,{x:0});
   const foreign=new Transfer();foreign.setData("text/plain","x");expect(drag(e.dom.surface,"dragover",foreign,{x:0}).defaultPrevented).toBe(false);drag(e.dom.surface,"drop",foreign,{x:0});
   expect(e.commands).toEqual([]);
  }finally{e.dom.dispose();}
 });
});

describe("shared native inline drag",()=>{
 it("drops one guarded replace_text_range batch at the planned revision",()=>{
  let revision=0,selection:RichSelection|null=range("p",2,4);const dispatched:{input:unknown;observed:string}[]=[];
  const sharedView=()=>({...view(tree(),revision,selection),format:"breditor/shared-rich-view"});
  const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>{const frozen=JSON.stringify(sharedView());return {view_json:()=>frozen,free:()=>{}};},free:vi.fn(),
   dispatch:vi.fn((_o:unknown,input:string)=>{dispatched.push({input:JSON.parse(input),observed:String(revision)});revision++;return true;}),
   undo_observed:vi.fn(()=>false),redo_observed:vi.fn(()=>false),set_selection:vi.fn((_o:unknown,input:string)=>{selection=JSON.parse(input) as RichSelection|null;revision++;return true;}),
   set_pending_formats:vi.fn(),insert_plain_text:vi.fn(),navigate_grid:vi.fn(()=>JSON.stringify({kind:"unchanged"})),receive_frame:vi.fn(),
   copy_clipboard:vi.fn(()=>JSON.stringify({richJson:'{"kind":"text"}',plainText:"cd"}))};
  const core=new SharedRichEditor(raw as unknown as SharedRustOwner),host=document.createElement("div");document.body.append(host);
  const errors:unknown[]=[];const dom=mountSharedEditor(host,{core,coreOwnership:"borrow",toolbar:[],onError:e=>errors.push(e)} as never);
  try{
   caretAt(dom.surface,[["p",6],["p",3]]);const data=new Transfer();
   drag(dom.surface,"dragstart",data);expect(data.getData("text/plain")).toBe("cd");
   drag(dom.surface,"dragover",data,{x:1});expect(host.querySelector<HTMLElement>(".breditor-text-drop-cursor")!.dataset["dropRejected"]).toBe("inside_source");
   drag(dom.surface,"drop",data,{x:1});expect(raw.dispatch).not.toHaveBeenCalled();
   drag(dom.surface,"dragstart",data);drag(dom.surface,"drop",data,{x:0});
   expect(dispatched).toEqual([{observed:"0",input:{commands:[
    {kind:"replace_text_range",data:{anchor:point("p",2),focus:point("p",4),runs:[]}},
    {kind:"replace_text_range",data:{anchor:point("p",4),focus:point("p",4),runs:[{text:"cd",formats:[strong]}]}},
   ],selectionUpdate:{kind:"set",value:range("p",4,6)}}}]);
   expect(errors).toEqual([]);
  }finally{dom.dispose();core.dispose();}
 });
});
