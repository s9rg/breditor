// @vitest-environment jsdom
import {describe,expect,it} from "vitest";
import {renderStaticDocument,StaticDocumentError} from "../src/static_document.js";
import {render} from "../../breditor-experimental-rich-content/src/render.js";
import {presentationModel} from "../../breditor-experimental-rich-content/src/model.js";
import type {RichView} from "../../breditor-experimental-rich-content/src/core.js";
import {el,envelope,p,text,type Json} from "./static_document_fixture.js";

const image=(id:string,props:Json={},caption=true,decorative=false)=>el("image",{"block-id":id,"image-id":`${id}-img`,"asset-id":"asset","asset-generation":"gen",decorative,"alt-text":decorative?"":"Chart",...props},caption?[p(`${id}-cap`,[text("Caption")])]:[]);
const html=(children:Json[])=>renderStaticDocument(envelope(children),{fragment:true});
const code=(run:()=>unknown):string=>{try{run();}catch(error){expect(error).toBeInstanceOf(StaticDocumentError);return (error as StaticDocumentError).code;}throw new Error("expected a StaticDocumentError");};

describe("static renderer: candidate rich V4 image links",()=>{
 it("wraps only the image in the inline safeLinkV1 anchor",()=>{
  expect(html([image("f",{"image-href":"https://example.com/a?b=1&c=2","image-link-new-window":true})])).toBe(
   '<figure data-rich-block="f" data-rich-image="f-img" data-asset-state="unresolved"><a data-rich-image-link="" class="breditor-image-link" href="https://example.com/a?b=1&amp;c=2" rel="noopener noreferrer" target="_blank"><img alt="Chart"></a><figcaption><p data-rich-block="f-cap" data-rich-text="f-cap">Caption</p></figcaption></figure>');
  expect(html([image("f",{"image-href":"https://example.com/"},false)])).toBe(
   '<figure data-rich-block="f" data-rich-image="f-img" data-asset-state="unresolved"><a data-rich-image-link="" class="breditor-image-link" href="https://example.com/"><img alt="Chart"></a></figure>');
  expect(html([image("f")])).not.toContain("<a");
 });
 it("rejects unsafe, noncanonical, decorative and misplaced link properties",()=>{
  for(const href of ["javascript:alert(1)","HTTPS://EXAMPLE.COM/","https://example.com","https://user:pw@example.com/","mailto:a@example.com","/relative","https://example.com/a b",7,null])
   expect(code(()=>html([image("f",{"image-href":href})]))).toBe("property");
  for(const flag of [false,"true",1])expect(code(()=>html([image("f",{"image-href":"https://example.com/","image-link-new-window":flag})]))).toBe("property");
  expect(code(()=>html([image("f",{"image-link-new-window":true})]))).toBe("property");
  expect(code(()=>html([image("f",{"image-href":"https://example.com/"},false,true)]))).toBe("property");
  expect(code(()=>html([p("x",[text("x")],{"image-href":"https://example.com/"})]))).toBe("property");
 });
 it("matches the live renderer's link structure and attributes (minus editing affordances)",()=>{
  const document=envelope([image("a",{"image-href":"https://example.com/a","image-link-new-window":true}),image("b",{"image-href":"https://example.org/x?y=1#z"},false),image("c")]);
  const view={format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify(document),readOnly:true,selection:null,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:0,grid:null,tables:[]} as unknown as RichView;
  const live=globalThis.document.createElement("div");render(live,presentationModel(view,"original"),{});
  const host=globalThis.document.createElement("div");host.innerHTML=renderStaticDocument(document,{fragment:true});
  const editing=new Set(["draggable","tabindex"]);
  const links=(root:Element)=>[...root.querySelectorAll("figure")].map(figure=>{
   const anchor=figure.querySelector("a");
   return anchor?{parent:anchor.parentElement===figure,children:[...anchor.children].map(c=>c.tagName),caption:figure.querySelector("figcaption a")!==null,attributes:Object.fromEntries([...anchor.attributes].filter(a=>!editing.has(a.name)).map(a=>[a.name,a.value]))}:null;
  });
  expect(links(host)).toEqual(links(live));
  expect(links(host).filter(Boolean)).toHaveLength(2);
 });
});
