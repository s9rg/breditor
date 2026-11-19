// @vitest-environment jsdom
import {describe,expect,it,vi} from "vitest";
import {render} from "../src/render.js";
import {presentationModel,type ElementNode} from "../src/model.js";
import {applyListNumbering} from "../src/list_numbering_presentation.js";
import {listNumberingControl,selectedOrderedList} from "../src/list_numbering_controls.js";
import {encodeListNumberingPatch} from "../src/list_numbering_serialization.js";
import {createRichToolbarV4} from "../src/rich_toolbar_v4.js";
import {createLayoutRichToolbarV3} from "../src/layout_toolbar_v3.js";
import {blockLayoutControls} from "../src/block_layout_controls.js";
import {isStructuralRichLanguage} from "../src/rich_language.js";
import {createStandardRichInlinePresentationV1} from "../src/standard_inline_v1.js";
import type {RichCoreEditor,RichListNumberingPatch,RichView,RichWasmModule} from "../src/core.js";
import {compileStandardRichProfileV4,compileRichProfileV4,compileStandardLayoutRichProfileV3} from "../index.js";
import {staticInlineCatalogV1} from "../../breditor-editor/src/static_document.js";

const fingerprint=`sha256:${"ab".repeat(32)}`;
const el=(type:string,properties:Record<string,unknown>,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v])),children});
const p=(id:string,text:string)=>el("paragraph",{"block-id":id},[{kind:"text",text,formats:[]}]);
const item=(id:string,children:unknown[]=[])=>el("list-item",{"block-id":id},[p(`${id}-p`,id),...children]);
function documentJson(outer:Record<string,unknown>,inner:Record<string,unknown>={}):string{
 const nested=el("ordered-list",{"block-id":"inner",start:1,...inner},[item("x")]);
 const bullets=el("bullet-list",{"block-id":"bullets"},[item("y")]);
 return JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"breditor/rich-test",version:1},schemaFingerprint:fingerprint,root:el("document",{"document-id":"doc"},[el("ordered-list",{"block-id":"outer",start:3,...outer},[item("a",[nested]),item("b",[bullets])])])});
}
const caret=(block:string)=>({kind:"text" as const,anchor:{block,offset:"0",affinity:"after" as const},focus:{block,offset:"0",affinity:"after" as const}});
function view(json:string,selection:RichView["selection"]=null):RichView{
 return {format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:json,readOnly:false,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[]} as unknown as RichView;
}
const catalogJson=JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"breditor/rich-test",version:1,fingerprint},formats:[...staticInlineCatalogV1].sort((a,b)=>a.kind<b.kind?-1:1)});
const owner=(language:1|2|3|4,numbering=language===4)=>({supportsStandardInlineControls:()=>true,caretFormats:()=>[],inlineFormatState:(kind:string)=>({format:"breditor/rich-inline-format-state",formatVersion:1,formatKind:kind,schema:{name:"breditor/rich-test",version:1,fingerprint},state:{kind:"unset"}}),richLanguageVersion:()=>language,supportsListNumbering:()=>numbering,supportsTextLanguage:()=>numbering,supportsBlockLayout:()=>language>=3,blockLayoutState:()=>({format:"breditor/rich-block-layout-state",formatVersion:1,schema:{name:"t",version:1,fingerprint},blocks:"0",alignment:{kind:"unavailable"},direction:{kind:"unavailable"},indent:{kind:"unavailable"},lineHeightPercent:{kind:"unavailable"}})}) as unknown as RichCoreEditor;

describe("candidate rich V4 list numbering presentation",()=>{
 it("renders start, closed type tokens and reversed per list without inheritance",()=>{
  for(const [code,type] of [[1,"1"],[2,"a"],[3,"A"],[4,"i"],[5,"I"]] as const){
   const surface=document.createElement("div");render(surface,presentationModel(view(documentJson({"list-style":code,"list-reversed":true})),"original"),{});
   const outer=surface.querySelector<HTMLOListElement>("[data-rich-block=outer]")!,inner=surface.querySelector<HTMLOListElement>("[data-rich-block=inner]")!;
   expect(outer.getAttribute("start")).toBe("3");expect(outer.getAttribute("type")).toBe(type);expect(outer.reversed).toBe(true);
   expect(inner.hasAttribute("type")).toBe(false);expect(inner.reversed).toBe(false);expect(inner.getAttribute("start")).toBe("1");
  }
  const plain=document.createElement("div");render(plain,presentationModel(view(documentJson({})),"original"),{});
  expect(plain.querySelector("ol")!.outerHTML.startsWith('<ol data-rich-block="outer" start="3">')).toBe(true);
 });
 it("removes stale attributes and refuses malformed or misplaced values before changing the element",()=>{
  const ol=document.createElement("ol");const node=(props:Record<string,unknown>,type="ordered-list")=>el(type,{"block-id":"l",start:2,...props},[]) as unknown as ElementNode;
  applyListNumbering(ol,node({"list-style":4,"list-reversed":true}));applyListNumbering(ol,node({}));
  expect(ol.hasAttribute("type")).toBe(false);expect(ol.hasAttribute("reversed")).toBe(false);expect(ol.getAttribute("start")).toBe("2");
  for(const bad of [{"list-style":0},{"list-style":6},{"list-style":"a"},{"list-style":1.5},{"list-reversed":false},{"list-reversed":"true"},{start:0}]){
   const target=document.createElement("ol"),before=target.outerHTML;expect(()=>applyListNumbering(target,node(bad))).toThrow(TypeError);expect(target.outerHTML).toBe(before);
  }
  expect(()=>applyListNumbering(document.createElement("ul"),node({"list-style":2},"bullet-list"))).toThrow("only to ordered lists");
 });
});

describe("candidate rich V4 numbering intent and toolbar",()=>{
 it("snapshots only primitive intent",()=>{
  expect(encodeListNumberingPatch({list:"l",style:null,reversed:false,start:undefined} as unknown as RichListNumberingPatch)).toEqual({list:"l",style:null,reversed:false});
  for(const bad of [{list:"l",start:NaN},{list:"l",start:1.5},{list:"l",reversed:"yes"},{list:"l",style:{toJSON:()=>"decimal"}},{list:1},{list:"l",css:"x"},null,[],new Date()])expect(()=>encodeListNumberingPatch(bad as unknown as RichListNumberingPatch)).toThrow(TypeError);
 });
 it("targets only the ordered list that owns the whole selection",()=>{
  const json=documentJson({});
  expect(selectedOrderedList(presentationModel(view(json,caret("a-p")),"original"))?.properties["breditor/block-id"]).toBe("outer");
  expect(selectedOrderedList(presentationModel(view(json,caret("x-p")),"original"))?.properties["breditor/block-id"]).toBe("inner");
  // A bullet list nested in an ordered list is its own target; it never borrows the ancestor numbering.
  expect(selectedOrderedList(presentationModel(view(json,caret("y-p")),"original"))).toBeUndefined();
  expect(selectedOrderedList(presentationModel(view(json,{kind:"text",anchor:caret("a-p").anchor,focus:caret("x-p").focus}),"original"))).toBeUndefined();
  expect(selectedOrderedList(presentationModel(view(json,null),"original"))).toBeUndefined();
 });
 it("reads native AST values and sends only changed fields",()=>{
  const control=listNumberingControl(owner(4)),model=presentationModel(view(documentJson({"list-style":2,"list-reversed":true}),caret("a-p")),"original");
  expect(control.read(model)).toEqual({kind:"uniform",values:{style:"lower-alpha",order:"reversed",start:"3"}});
  expect(control.patch(model,{style:"lower-alpha",order:"reversed",start:"3"})).toBeNull();
  expect(control.patch(model,{style:"upper-roman",order:"reversed",start:"3"})).toEqual({list:"outer",style:"upper-roman"});
  expect(control.patch(model,{style:"default",order:"ascending",start:"7"})).toEqual({list:"outer",style:null,reversed:false,start:7});
  expect(control.patch(model,{style:"lower-alpha",order:"reversed",start:""})).toBeNull();
  for(const fields of [{style:"disc"},{order:"down"},{start:"0"},{start:"1.5"},{start:"2147483648"},{start:"-1"}])expect(()=>control.patch(model,fields)).toThrow(TypeError);
  expect(control.read(presentationModel(view(documentJson({}),caret("y-p")),"original"))).toEqual({kind:"unavailable"});
 });
 it("binds the V4 toolbar only to an explicit V4 owner and keeps V3 strict",()=>{
  const presentation=createStandardRichInlinePresentationV1(catalogJson);
  const v4=createRichToolbarV4(owner(4),presentation),numbering=v4.find(c=>c.id==="list-numbering")!;
  expect(v4.some(c=>c.id==="block-alignment")).toBe(true);expect(v4.some(c=>c.id==="blockquote")).toBe(true);
  const core=owner(4),bound=createRichToolbarV4(core,presentation).find(c=>c.id==="list-numbering")!,model=presentationModel(view(documentJson({}),caret("x-p")),"original");
  expect(bound.command({core,model,allocate:()=>"id",stamp:()=>({replica:"1",counter:"1",lamport:"1"})},undefined,{style:"lower-roman",order:"ascending",start:"1"})).toEqual({kind:"setListNumbering",data:{list:"inner",style:"lower-roman"}});
  expect(()=>numbering.command({core:owner(4),model,allocate:()=>"id",stamp:()=>({replica:"1",counter:"1",lamport:"1"})},undefined,{style:"decimal"})).toThrow("different Rust owner");
  for(const language of [1,2,3] as const)expect(()=>createRichToolbarV4(owner(language),presentation)).toThrow();
  expect(()=>createRichToolbarV4(owner(4,false),presentation)).toThrow("rich V4 owner");
  expect(()=>createLayoutRichToolbarV3(owner(4),presentation)).toThrow("V3 owner");
  expect(createLayoutRichToolbarV3(owner(3),presentation).some(c=>c.id==="list-numbering")).toBe(false);
  expect(blockLayoutControls(owner(4))).toHaveLength(5);expect(isStructuralRichLanguage(4)).toBe(true);expect(isStructuralRichLanguage(5)).toBe(false);
 });
});

describe("explicit V4 Wasm factory boundary",()=>{
 function stringResult(value:string){return {status:"value",takeValue:()=>value,free:vi.fn()};}
 function local(binding:object,capability:unknown="1"){
  const observation={revision:"1",blockLayoutStateJson:vi.fn(),free:vi.fn()};
  const editor={observe:()=>observation,blockLayoutVersion:()=>"1",listNumberingVersion:()=>capability,textLanguageVersion:()=>"1",execute:vi.fn(()=>({status:"content",takeObservation:()=>observation,free:vi.fn()})),free:vi.fn()};
  const raw={descriptorJson:()=>stringResult(JSON.stringify({kind:"rich",abiVersion:1,...binding})),createEditor:()=>({status:"editor",takeEditor:()=>editor,free:vi.fn()}),free:vi.fn()};
  const factory=vi.fn(()=>({status:"profile",takeProfile:()=>raw,free:vi.fn()}));
  const wasm={BreditorRichProfile:{fromBootstrapJson:factory,fromBootstrapJsonV4:factory,fromStandardBootstrapJsonV4:factory,fromStandardLayoutBootstrapJsonV3:factory}} as unknown as RichWasmModule;
  return {wasm,raw,editor,factory};
 }
 const v4={richLanguageVersion:4,taskStructureVersion:1,blockLayoutVersion:1,listNumberingVersion:1,textLanguageVersion:1};
 it("selects V4 only explicitly with every matching capability",()=>{
  const a=local(v4),profile=compileStandardRichProfileV4(a.wasm,"bootstrap"),core=profile.createEditor("document");
  expect(core.richLanguageVersion?.()).toBe(4);expect(core.supportsListNumbering?.()).toBe(true);expect(core.supportsBlockLayout?.()).toBe(true);
  core.execute({kind:"setListNumbering",data:{list:"l",style:"upper-alpha",reversed:true}});
  expect(JSON.parse(a.editor.execute.mock.calls[0]![1] as unknown as string)).toEqual({kind:"setListNumbering",data:{list:"l",style:"upper-alpha",reversed:true}});
  expect(()=>core.execute({kind:"setListNumbering",data:{list:"l",start:NaN}})).toThrow(TypeError);expect(a.editor.execute).toHaveBeenCalledOnce();
  core.dispose();profile.dispose();
  expect(compileRichProfileV4(local(v4).wasm,"bootstrap").descriptor().listNumberingVersion).toBe(1);
  for(const bad of [{...v4,listNumberingVersion:undefined},{...v4,listNumberingVersion:2},{...v4,blockLayoutVersion:undefined},{...v4,taskStructureVersion:undefined},{...v4,richLanguageVersion:3}]){const b=local(bad);expect(()=>compileStandardRichProfileV4(b.wasm,"bootstrap")).toThrow();expect(b.raw.free).toHaveBeenCalledOnce();}
  // A V3 factory never accepts a V4 descriptor and vice versa.
  const v3=local(v4);expect(()=>compileStandardLayoutRichProfileV3(v3.wasm,"bootstrap")).toThrow("Unsupported rich owner ABI");
  for(const capability of ["0",null,1]){const c=local(v4,capability),pr=compileStandardRichProfileV4(c.wasm,"bootstrap");expect(()=>pr.createEditor("document")).toThrow("list numbering");expect(c.editor.free).toHaveBeenCalledOnce();pr.dispose();}
  expect(()=>compileStandardRichProfileV4({BreditorRichProfile:{fromBootstrapJson:vi.fn()}} as unknown as RichWasmModule,"bootstrap")).toThrow("rich V4");
 });
});
