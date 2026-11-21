// @vitest-environment jsdom
import {describe,expect,it} from "vitest";
import {render} from "../src/render.js";
import {presentationModel} from "../src/model.js";
import {legalListMarkers,multiBlockListBackspace,multiBlockListEnter,richLegalListStyles} from "../src/list_structure.js";
import {boundaryDelete,enter,listTab,type ActionContext} from "../src/actions.js";
import type {RichView} from "../src/core.js";
import {renderStaticDocument} from "../../breditor-editor/src/static_document.js";

const fingerprint=`sha256:${"ab".repeat(32)}`;
const el=(type:string,properties:Record<string,unknown>,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v])),children});
const p=(id:string,text="")=>el("paragraph",{"block-id":id},text?[{kind:"text",text,formats:[]}]:[]);
const li=(id:string,...children:unknown[])=>el("list-item",{"block-id":id},children);
const ol=(id:string,start:number,items:unknown[],extra:Record<string,unknown>={})=>el("ordered-list",{"block-id":id,start,...extra},items);
const ul=(id:string,items:unknown[])=>el("bullet-list",{"block-id":id},items);
const json=(...children:unknown[])=>JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"breditor/rich-test",version:1},schemaFingerprint:fingerprint,root:el("document",{"document-id":"doc"},children)});
const caret=(block:string,offset=0)=>({kind:"text" as const,anchor:{block,offset:String(offset),affinity:"after" as const},focus:{block,offset:String(offset),affinity:"after" as const}});
function view(documentJson:string,selection:RichView["selection"]=null):RichView{
 return {format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson,readOnly:false,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[]} as unknown as RichView;
}
const model=(documentJson:string,selection:RichView["selection"]=null)=>presentationModel(view(documentJson,selection),"original");
const context=(documentJson:string,selection:RichView["selection"]):ActionContext=>{let n=0;return {model:model(documentJson,selection),allocate:kind=>`${kind}-${++n}`,stamp:()=>({replica:"1",counter:"0",lamport:"0"})};};

// a: [pa], b: [pb, pb2(empty), pb3], c: [pc(empty)]
const multi=json(ul("list",[li("a",p("pa","one")),li("b",p("pb","two"),p("pb2"),p("pb3","three")),li("c",p("pc"))]));

describe("multi-block list item keyboard intents",()=>{
 it("Enter in an empty later paragraph lifts it and what follows into a new sibling item",()=>{
  expect(multiBlockListEnter(model(multi,caret("pb2")))).toEqual({block:"pb2",item:"b"});
  expect(enter(context(multi,caret("pb2")))).toEqual({kind:"splitListItemBlock",data:{block:"pb2",newItem:"item-1"}});
  // Not for a leading block, a nonempty later paragraph or a range.
  expect(multiBlockListEnter(model(multi,caret("pc")))).toBeUndefined();
  expect(multiBlockListEnter(model(multi,caret("pb3",2)))).toBeUndefined();
  expect(enter(context(multi,caret("pb3",5)))).toEqual({kind:"insertParagraph",data:{right:"p-1",newItem:null}});
  expect(multiBlockListEnter(model(multi,{kind:"text",anchor:caret("pb2").anchor,focus:caret("pb3",1).focus}))).toBeUndefined();
 });
 it("Backspace in an empty leading block keeps the item as later blocks of the previous item",()=>{
  expect(multiBlockListBackspace(model(multi,caret("pc")))).toEqual({container:"list",left:"b",right:"c"});
  expect(boundaryDelete(context(multi,caret("pc")),true)).toEqual({kind:"joinListItems",data:{container:"list",left:"b",right:"c",blocks:true}});
  // A nonempty leading block keeps the text join; Delete (forward) is unchanged.
  expect(boundaryDelete(context(multi,caret("pb")),true)).toEqual({kind:"joinListItems",data:{container:"list",left:"a",right:"b"}});
  expect(boundaryDelete(context(multi,caret("pc")),false)).toBeNull();
  // The first item has no previous item; a later empty paragraph joins its previous paragraph.
  const first=json(ul("list",[li("a",p("pa")),li("b",p("pb","x"))]));
  expect(multiBlockListBackspace(model(first,caret("pa")))).toBeUndefined();
  expect(boundaryDelete(context(multi,caret("pb2")),true)).toEqual({kind:"joinTextBlocks",data:{left:"pb",right:"pb2"}});
 });
});

describe("Tab and Shift+Tab in ordinary lists",()=>{
 it("indent the whole item from any of its blocks and keep focus navigation elsewhere",()=>{
  expect(listTab(context(multi,caret("pb3",1)),false)).toEqual({kind:"indentListItems",data:{container:"list",first:"b",last:"b",nested:{block:"list-1",start:null}}});
  expect(listTab(context(multi,caret("pa")),false)).toBeNull();
  // Top-level Shift+Tab keeps reverse focus navigation; a nested list outdents.
  expect(listTab(context(multi,caret("pb3")),true)).toBeNull();
  const nested=json(ul("list",[li("a",p("pa","one"),ul("inner",[li("x",p("px","x")),li("y",p("py","y"),p("py2","later"))]))]));
  expect(listTab(context(nested,caret("py2")),true)).toEqual({kind:"outdentListItems",data:{container:"inner",first:"y",last:"y",tail:null}});
  expect(listTab(context(json(p("solo","x")),caret("solo")),false)).toBeNull();
 });
});

// 3. [a] 4. [b: 4.1. [x], 4.2. [y: • [z: 1. [w]]]], reversed 9 nested in b's second item via y? keep simple.
const legal=json(
 ol("outer",3,[
  li("a",p("pa","a")),
  li("b",p("pb","b"),ol("inner",1,[li("x",p("px","x")),li("y",p("py","y"),ol("deep",5,[li("d1",p("pd1")),li("d2",p("pd2"))],{"list-reversed":true}))]),ul("bullets",[li("z",p("pz"),ol("restart",1,[li("w",p("pw"))]))])),
 ],{"list-style":4}),
 p("after","x"),
 ol("second",1,[li("s",p("ps"))]),
);

describe("legal multi-level numbering presentation",()=>{
 it("derives decimal markers from each list's own start and counting order",()=>{
  const markers=legalListMarkers(model(legal).root),byId=new Map([...markers].map(([node,marker])=>[String(node.properties["breditor/block-id"]),marker]));
  expect(Object.fromEntries(byId)).toEqual({a:"3.",b:"4.",x:"4.1.",y:"4.2.",d1:"4.2.5.",d2:"4.2.4.",w:"1.",s:"1."});
 });
 it("renders opt-in attributes only and keeps default output exact",()=>{
  const plain=document.createElement("div");render(plain,model(legal),{});
  const off=document.createElement("div");render(off,model(legal),{legalListNumbering:false});
  expect(off.innerHTML).toBe(plain.innerHTML);
  expect(plain.querySelector("[data-rich-legal],[data-rich-legal-marker]")).toBeNull();
  const on=document.createElement("div");render(on,model(legal),{legalListNumbering:true});
  const marker=(block:string)=>on.querySelector(`[data-rich-block="${block}"]`)!.getAttribute("data-rich-legal-marker");
  expect([marker("a"),marker("x"),marker("d2"),marker("w"),marker("z")]).toEqual(["3.","4.1.","4.2.4.","1.",null]);
  expect(on.querySelector('[data-rich-block="outer"]')!.getAttribute("role")).toBe("list");
  expect(on.querySelector('[data-rich-block="bullets"]')!.hasAttribute("data-rich-legal")).toBe(false);
  // Native numbering attributes are kept, so the plain HTML meaning is unchanged.
  expect(on.querySelector('[data-rich-block="outer"]')!.getAttribute("type")).toBe("i");
  // The marker is generated content: no text enters the editable DOM.
  expect(on.textContent).toBe(plain.textContent);
  expect(()=>render(document.createElement("div"),model(legal),{legalListNumbering:"yes" as unknown as boolean})).toThrow(TypeError);
  expect(richLegalListStyles).toContain("content:attr(data-rich-legal-marker)");
 });
 it("static rendering has marker parity with the live renderer",()=>{
  const live=document.createElement("div");render(live,model(legal),{legalListNumbering:true});
  const host=document.createElement("div");host.innerHTML=renderStaticDocument(JSON.parse(legal),{legalListNumbering:true});
  const read=(root:Element)=>[...root.querySelectorAll("li")].map(item=>[item.getAttribute("data-rich-block"),item.getAttribute("data-rich-legal-marker")]);
  expect(read(host)).toEqual(read(live));
  expect(host.querySelector("style[data-breditor-legal-lists]")).not.toBeNull();
  expect(renderStaticDocument(JSON.parse(legal),{legalListNumbering:true,fragment:true})).not.toContain("<style");
  expect(renderStaticDocument(JSON.parse(legal))).toBe(renderStaticDocument(JSON.parse(legal),{legalListNumbering:false}));
  expect(renderStaticDocument(JSON.parse(legal))).not.toContain("data-rich-legal");
  expect(()=>renderStaticDocument(JSON.parse(legal),{legalListNumbering:1 as unknown as boolean})).toThrow(TypeError);
 });
});
