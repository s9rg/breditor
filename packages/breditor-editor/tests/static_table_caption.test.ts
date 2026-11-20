// @vitest-environment jsdom
import {describe,expect,it} from "vitest";
import {renderStaticDocument,StaticDocumentError} from "../src/static_document.js";
import {render} from "../../breditor-experimental-rich-content/src/render.js";
import {presentationModel} from "../../breditor-experimental-rich-content/src/model.js";
import type {RichView} from "../../breditor-experimental-rich-content/src/core.js";
import {el,envelope,f,p,text,type Json} from "./static_document_fixture.js";

const columns=[{id:"a",width:120},{id:"b",width:96}];
const row=(r:string)=>el("table-row",{"block-id":`row-${r}`,"row-id":r},columns.map(c=>el("table-cell",{"block-id":`cell-${r}-${c.id}`,"column-id":c.id,header:false},[p(`p-${r}-${c.id}`,[text(`${r}${c.id}`)])])));
const table=(tail:Json[]=[],rows=["r1","r2"])=>el("table",{"block-id":"tbl","table-id":"t1",columns,merges:[],"retracted-merges":[]},[...rows.map(row),...tail]);
const caption=(children:Json[]=[text("Legend")])=>p("cap",children);
const html=(children:Json[],options={})=>renderStaticDocument(envelope(children),{fragment:true,...options});
const code=(run:()=>unknown):string=>{try{run();}catch(error){expect(error).toBeInstanceOf(StaticDocumentError);return (error as StaticDocumentError).code;}throw new Error("expected a StaticDocumentError");};

describe("static renderer: candidate rich V4 table captions",()=>{
 it("emits <caption> first, shown after the rows, with inline caption content",()=>{
  const out=html([table([caption([text("Bold",[f("breditor/strong")]),text(" legend")])])]);
  expect(out.startsWith('<table data-rich-block="tbl" data-rich-table="t1"><caption data-rich-table-caption="t1" style="caption-side:bottom"><p data-rich-block="cap" data-rich-text="cap"><strong data-rich-format="breditor/strong">Bold</strong> legend</p></caption><colgroup>')).toBe(true);
  expect(html([table([caption([])])])).toContain('<caption data-rich-table-caption="t1" style="caption-side:bottom"><p data-rich-block="cap" data-rich-text="cap"><br></p></caption>');
  // Without a caption the table output is unchanged.
  expect(html([table()])).not.toContain("<caption");
  expect(html([table([caption()])],{blockIds:false})).toContain('<caption data-rich-table-caption="t1" style="caption-side:bottom"><p>Legend</p></caption>');
  const host=document.createElement("div");host.innerHTML=html([table([caption()])]);
  const element=host.querySelector("table")!;expect(element.caption?.textContent).toBe("Legend");expect(element.rows).toHaveLength(2);
 });
 it("keeps a hidden table hidden, caption included",()=>{
  const result=renderStaticDocument(envelope([table([caption()],[])]),{fragment:true});
  expect(result).toBe("");
 });
 it("rejects misplaced, repeated and non-paragraph captions",()=>{
  const misplaced=el("table",{"block-id":"tbl","table-id":"t1",columns,merges:[],"retracted-merges":[]},[caption(),row("r1")]);
  expect(code(()=>html([misplaced]))).toBe("grammar");
  expect(code(()=>html([table([caption(),p("cap2",[text("x")])])]))).toBe("grammar");
  expect(code(()=>html([table([el("heading",{"block-id":"h",level:2},[text("x")])])]))).toBe("grammar");
  expect(code(()=>html([table([el("blockquote",{"block-id":"q"},[p("x")])])]))).toBe("grammar");
  // The row ceiling stays 256: a 257th child must be the caption.
  const many=Array.from({length:256},(_,i)=>`r${i}`);
  expect(html([table([caption()],many)])).toContain("<caption");
  expect(code(()=>html([table([row("extra")],many)]))).toBe("grammar");
 });
 it("matches the live renderer's caption structure and attributes",()=>{
  const document=envelope([table([caption([text("Legend",[f("breditor/strong")])])])]);
  const cells=["r1","r2"].flatMap(r=>columns.map(c=>{const cell={table:"t1",row:r,column:c.id};return {base:cell,master:cell,rowSpan:1,columnSpan:1,sources:[cell]};}));
  const view={format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify(document),readOnly:true,selection:null,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:0,grid:null,tables:[{id:"t1",hidden:false,rows:["r1","r2"],columns,cells}]} as unknown as RichView;
  const live=globalThis.document.createElement("div");render(live,presentationModel(view,"original"),{});
  const host=globalThis.document.createElement("div");host.innerHTML=renderStaticDocument(document,{fragment:true});
  const shape=(root:Element)=>[...root.querySelectorAll("caption")].map(node=>({parent:node.parentElement?.tagName,first:node.parentElement?.firstElementChild===node,side:(node as HTMLElement).style.captionSide,attributes:Object.fromEntries([...node.attributes].filter(a=>a.name!=="style").map(a=>[a.name,a.value])),html:node.innerHTML}));
  expect(shape(host)).toEqual(shape(live));
  expect(shape(host)).toEqual([{parent:"TABLE",first:true,side:"bottom",attributes:{"data-rich-table-caption":"t1"},html:'<p data-rich-block="cap" data-rich-text="cap"><strong data-rich-format="breditor/strong">Legend</strong></p>'}]);
  expect((live.querySelector("table") as HTMLTableElement).rows).toHaveLength(2);
 });
});
