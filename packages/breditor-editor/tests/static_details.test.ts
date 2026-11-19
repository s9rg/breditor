// @vitest-environment jsdom
import {describe,expect,it} from "vitest";
import {renderStaticDocument,StaticDocumentError} from "../src/static_document.js";
import {render} from "../../breditor-experimental-rich-content/src/render.js";
import {presentationModel} from "../../breditor-experimental-rich-content/src/model.js";
import type {RichView} from "../../breditor-experimental-rich-content/src/core.js";
import {el,envelope,f,p,text,type Json} from "./static_document_fixture.js";

const summary=(id:string,children:Json[]=[]):Json=>el("details-summary",{"block-id":id},children);
const section=(id:string,open:boolean,children:Json[]):Json=>el("details",{"block-id":id,...(open?{"details-open":true}:{})},children);
const html=(children:Json[],options={})=>renderStaticDocument(envelope(children),{fragment:true,...options});
const code=(run:()=>unknown):string=>{try{run();}catch(error){expect(error).toBeInstanceOf(StaticDocumentError);return (error as StaticDocumentError).code;}throw new Error("expected a StaticDocumentError");};

describe("static renderer: candidate rich V4 collapsible sections",()=>{
 it("emits native details/summary with open reflecting persisted state",()=>{
  expect(html([section("d",true,[summary("s",[text("Title",[f("breditor/strong")])]),p("b",[text("Body")])])])).toBe(
   '<details data-rich-block="d" data-rich-details="d" open=""><summary data-rich-block="s" data-rich-text="s"><strong data-rich-format="breditor/strong">Title</strong></summary><p data-rich-block="b" data-rich-text="b">Body</p></details>');
  expect(html([section("d",false,[summary("s"),p("b")])],{blockIds:false})).toBe("<details><summary><br></summary><p><br></p></details>");
  // Native toggling works in static output.
  const host=document.createElement("div");host.innerHTML=html([section("d",false,[summary("s",[text("T")]),p("b",[text("x")])])]);
  const details=host.querySelector("details")!;expect(details.open).toBe(false);details.open=true;expect(details.hasAttribute("open")).toBe(true);
 });
 it("admits sections in every flow container up to the nesting bound",()=>{
  let node:Json=p("leaf",[text("x")]);
  for(let level=7;level>=0;level--)node=section(`n${level}`,true,[summary(`s${level}`),node]);
  expect(html([node])).toContain('data-rich-block="leaf"');
  expect(code(()=>html([section("top",true,[summary("top-s"),node])]))).toBe("grammar");
  expect(html([el("blockquote",{"block-id":"q"},[section("d",false,[summary("s"),p("b")])])])).toContain("<blockquote");
 });
 it("rejects malformed sections and open values",()=>{
  expect(code(()=>html([section("d",false,[p("b")])]))).toBe("grammar");
  expect(code(()=>html([section("d",false,[summary("s")])]))).toBe("grammar");
  expect(code(()=>html([section("d",false,[p("b"),summary("s")])]))).toBe("grammar");
  expect(code(()=>html([section("d",false,[summary("s"),summary("t"),p("b")])]))).toBe("grammar");
  expect(code(()=>html([summary("s")]))).toBe("grammar");
  for(const value of [false,"true",1])expect(code(()=>html([el("details",{"block-id":"d","details-open":value},[summary("s"),p("b")])]))).toBe("property");
  expect(code(()=>html([p("x",[],{"details-open":true})]))).toBe("property");
  expect(code(()=>html([section("d",false,[el("details-summary",{"block-id":"s","block-align":2}),p("b")])]))).toBe("property");
 });
 it("matches the live renderer's section structure and attributes",()=>{
  const document=envelope([section("a",true,[summary("as",[text("Open")]),p("ab",[text("x")]),section("n",false,[summary("ns"),p("nb")])]),section("c",false,[summary("cs",[text("Closed")]),p("cb")])]);
  const view={format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify(document),readOnly:true,selection:null,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:0,grid:null,tables:[]} as unknown as RichView;
  const live=globalThis.document.createElement("div");render(live,presentationModel(view,"original"),{});
  const host=globalThis.document.createElement("div");host.innerHTML=renderStaticDocument(document,{fragment:true});
  const shape=(root:Element)=>[...root.querySelectorAll("details,summary")].map(node=>({tag:node.tagName,parent:node.parentElement?.tagName,attributes:Object.fromEntries([...node.attributes].map(a=>[a.name,a.name==="open"?"":a.value])),text:node.tagName==="SUMMARY"?node.textContent:null}));
  expect(shape(host)).toEqual(shape(live));
  expect(shape(host)).toHaveLength(6);
 });
});
