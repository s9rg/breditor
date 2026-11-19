// @vitest-environment jsdom
import {describe,expect,it} from "vitest";
import {renderStaticDocument,StaticDocumentError} from "../src/static_document.js";
import {render} from "../../breditor-experimental-rich-content/src/render.js";
import {presentationModel} from "../../breditor-experimental-rich-content/src/model.js";
import type {RichView} from "../../breditor-experimental-rich-content/src/core.js";
import {el,envelope,p,text,type Json} from "./static_document_fixture.js";

const list=(id:string,props:Json,children:Json[]=[el("list-item",{"block-id":`${id}-i`},[p(`${id}-p`,[text(id)])])])=>el("ordered-list",{"block-id":id,start:4,...props},children);
const html=(children:Json[])=>renderStaticDocument(envelope(children),{fragment:true});
const code=(run:()=>unknown):string=>{try{run();}catch(error){expect(error).toBeInstanceOf(StaticDocumentError);return (error as StaticDocumentError).code;}throw new Error("expected a StaticDocumentError");};

describe("static renderer: candidate rich V4 ordered-list numbering",()=>{
 it("emits closed type tokens and reversed from admitted values only",()=>{
  for(const [style,type] of [[1,"1"],[2,"a"],[3,"A"],[4,"i"],[5,"I"]] as const)
   expect(html([list("l",{"list-style":style})])).toContain(`<ol data-rich-block="l" start="4" type="${type}">`);
  expect(html([list("l",{"list-reversed":true})])).toContain('<ol data-rich-block="l" start="4" reversed>');
  expect(html([list("l",{})])).toContain('<ol data-rich-block="l" start="4">');
  // Nested lists keep their own values; nothing is inherited.
  const nested=list("outer",{"list-style":5,"list-reversed":true},[el("list-item",{"block-id":"oi"},[p("op",[text("o")]),list("inner",{})])]);
  const out=html([nested]);expect(out).toContain('<ol data-rich-block="outer" start="4" type="I" reversed>');expect(out).toContain('<ol data-rich-block="inner" start="4">');
 });
 it("rejects out-of-domain, noncanonical and misplaced numbering properties",()=>{
  for(const bad of [{"list-style":0},{"list-style":6},{"list-style":"a"},{"list-style":2.5},{"list-reversed":false},{"list-reversed":"true"}])
   expect(code(()=>html([list("l",bad)]))).toBe("property");
  expect(code(()=>html([el("bullet-list",{"block-id":"b","list-style":2},[el("list-item",{"block-id":"bi"},[p("bp",[text("b")])])])]))).toBe("property");
  expect(code(()=>html([p("x",[text("x")],{"list-reversed":true})]))).toBe("property");
 });
 it("matches the live renderer's attributes for every style and reversal",()=>{
  const children=[1,2,3,4,5].map(style=>list(`l${style}`,{"list-style":style,...(style%2?{"list-reversed":true}:{})}));
  const document=envelope(children),view={format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify(document),readOnly:true,selection:null,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:0,grid:null,tables:[]} as unknown as RichView;
  const live=globalThis.document.createElement("div");render(live,presentationModel(view,"original"),{});
  const host=globalThis.document.createElement("div");host.innerHTML=renderStaticDocument(document,{fragment:true});
  const attrs=(root:Element)=>[...root.querySelectorAll("ol")].map(ol=>Object.fromEntries([...ol.attributes].map(a=>[a.name,a.value])));
  expect(attrs(host)).toEqual(attrs(live));
 });
});
