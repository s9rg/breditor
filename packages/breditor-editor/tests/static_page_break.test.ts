// @vitest-environment jsdom
import {describe,expect,it} from "vitest";
import {renderStaticDocument,StaticDocumentError} from "../src/static_document.js";
import {render} from "../../breditor-experimental-rich-content/src/render.js";
import {presentationModel} from "../../breditor-experimental-rich-content/src/model.js";
import {richPrintStyles} from "../../breditor-experimental-rich-content/src/print.js";
import type {RichView} from "../../breditor-experimental-rich-content/src/core.js";
import {el,envelope,p,text,table,type Json} from "./static_document_fixture.js";

const pb=(id:string,children:Json[]=[]):Json=>el("page-break",{"block-id":id},children);
const html=(children:Json[],options={})=>renderStaticDocument(envelope(children),{fragment:true,...options});
const code=(run:()=>unknown):string=>{try{run();}catch(error){expect(error).toBeInstanceOf(StaticDocumentError);return (error as StaticDocumentError).code;}throw new Error("expected a StaticDocumentError");};
const marker='<div data-rich-block="pb" data-rich-page-break="pb" class="breditor-page-break" role="separator" aria-label="Page break" style="break-after:page;page-break-after:always"></div>';

describe("static renderer: candidate rich V4 page breaks",()=>{
 it("emits an empty separator that forces a page break after it",()=>{
  expect(html([p("a",[text("One")]),pb("pb"),p("b",[text("Two")])])).toBe(`<p data-rich-block="a" data-rich-text="a">One</p>${marker}<p data-rich-block="b" data-rich-text="b">Two</p>`);
  expect(html([pb("pb")],{blockIds:false})).toBe('<div class="breditor-page-break" role="separator" aria-label="Page break" style="break-after:page;page-break-after:always"></div>');
  expect(html([pb("pb")],{pageBreakLabel:"Seitenumbruch <neu>"})).toContain('aria-label="Seitenumbruch &lt;neu&gt;"');
  for(const label of [""," ","a\u0007b","x".repeat(513),7])expect(()=>html([pb("pb")],{pageBreakLabel:label})).toThrow(TypeError);
  const host=document.createElement("div");host.innerHTML=html([pb("pb")]);
  expect((host.firstElementChild as HTMLElement).style.getPropertyValue("page-break-after")).toBe("always");
 });
 it("admits page breaks only in the document root and only without content",()=>{
  expect(code(()=>html([el("blockquote",{"block-id":"q"},[pb("pb")])]))).toBe("grammar");
  expect(code(()=>html([el("bullet-list",{"block-id":"l"},[el("list-item",{"block-id":"i"},[p("h"),pb("pb")])])]))).toBe("grammar");
  expect(code(()=>html([el("details",{"block-id":"d","details-open":true},[el("details-summary",{"block-id":"s"}),pb("pb")])]))).toBe("grammar");
  expect(code(()=>html([pb("pb",[text("x")])]))).toBe("grammar");
  expect(code(()=>html([pb("pb",[p("x")])]))).toBe("grammar");
  expect(code(()=>html([el("page-break",{"block-id":"pb","block-align":1})]))).toBe("property");
  expect(code(()=>html([el("page-break",{})]))).toBe("property");
 });
 it("matches the live renderer's element and attributes, minus editing affordances",()=>{
  const document=envelope([p("a",[text("One")]),pb("pb"),p("b",[text("Two")])]);
  const view={format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify(document),readOnly:true,selection:null,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:0,grid:null,tables:[]} as unknown as RichView;
  const live=globalThis.document.createElement("div");render(live,presentationModel(view,"original"),{});
  const host=globalThis.document.createElement("div");host.innerHTML=renderStaticDocument(document,{fragment:true});
  const editing=new Set(["contenteditable","data-select-node"]);
  const shape=(root:Element,skip:ReadonlySet<string>)=>[...root.querySelectorAll("[data-rich-page-break]")].map(node=>({tag:node.tagName,index:[...root.children].indexOf(node),html:node.innerHTML,attributes:Object.fromEntries([...node.attributes].filter(a=>!skip.has(a.name)).map(a=>[a.name,a.value]))}));
  expect(shape(host,new Set())).toEqual(shape(live,editing));
  expect(shape(host,new Set())).toEqual([{tag:"DIV",index:1,html:"",attributes:{"data-rich-block":"pb","data-rich-page-break":"pb",class:"breditor-page-break",role:"separator","aria-label":"Page break",style:"break-after:page;page-break-after:always"}}]);
 });
});

describe("static renderer: print/export mode",()=>{
 it("is off by default and leaves output byte-identical",()=>{
  const document=envelope([p("a",[text("One")]),table()]);
  expect(renderStaticDocument(document,{print:false})).toBe(renderStaticDocument(document));
  expect(renderStaticDocument(document)).not.toContain("<thead>");
  expect(renderStaticDocument(document)).not.toContain("<style");
 });
 it("embeds the print stylesheet in the wrapper and promotes leading header rows to <thead>",()=>{
  const document=envelope([p("a",[text("One")]),pb("pb"),table([],[])]);
  const out=renderStaticDocument(document,{print:{size:"Letter",margin:"narrow"}});
  expect(out.startsWith(`<div class="breditor-rich-surface" data-breditor-rich="" data-breditor-static=""><style data-breditor-print="">${richPrintStyles({size:"Letter",margin:"narrow"})}</style><p `)).toBe(true);
  expect(out).toContain('<thead><tr><th rowspan="1" colspan="1" data-rich-cell=');
  const host=globalThis.document.createElement("div");host.innerHTML=out;
  const element=host.querySelector("table")!;
  expect(element.tHead?.rows).toHaveLength(1);expect(element.tBodies[0]!.rows).toHaveLength(2);
  expect([...element.tHead!.rows[0]!.cells].every(cell=>cell.tagName==="TH")).toBe(true);
  // Fragments carry no stylesheet; hosts add richPrintStyles themselves.
  const fragment=renderStaticDocument(document,{print:true,fragment:true});
  expect(fragment).not.toContain("<style");expect(fragment).toContain("<thead>");
  expect(renderStaticDocument(document,{print:true})).toContain(richPrintStyles());
  for(const bad of [{size:"A5"},{orientation:"sideways"},"A4",7])expect(()=>renderStaticDocument(document,{print:bad as never})).toThrow(TypeError);
 });
 it("keeps tables without a header group (or with a spanning header cell) in <tbody>",()=>{
  const columns=[{id:"a",width:100},{id:"b",width:100}];
  const row=(r:string,header:boolean)=>el("table-row",{"block-id":`row-${r}`,"row-id":r},columns.map(c=>el("table-cell",{"block-id":`cell-${r}-${c.id}`,"column-id":c.id,header},[p(`p-${r}-${c.id}`,[text(r)])])));
  const make=(rows:Json[],merges:Json[]=[])=>el("table",{"block-id":"t","table-id":"t1",columns,merges,"retracted-merges":[]},rows);
  const print=(node:Json)=>renderStaticDocument(envelope([node]),{print:true,fragment:true});
  expect(print(make([row("r1",false),row("r2",false)]))).not.toContain("<thead>");
  // A table whose only rows are headers keeps one body row.
  expect(print(make([row("r1",true),row("r2",true)]))).toContain("<thead><tr>");
  expect(print(make([row("r1",true)]))).not.toContain("<thead>");
  // A header cell spanning the header row and the first body row cannot repeat on its own.
  const span={id:"m",lamport:"1",writer:"1",counter:"1",rows:["r1","r2","r3"],columns:["a","b"],"first-row":"r1","last-row":"r2","first-column":"a","last-column":"a"};
  expect(print(make([row("r1",true),row("r2",false),row("r3",false)],[span]))).not.toContain("<thead>");
  expect(print(make([row("r1",true),row("r2",true),row("r3",false)],[span]))).toContain("</thead><tbody>");
 });
});
