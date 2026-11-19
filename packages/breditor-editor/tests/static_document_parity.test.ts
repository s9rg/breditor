/**
 * Structural parity between the inert static string and the live rich DOM renderer.
 * The live side uses the real `render()` with the standard inline V1 presentation over a
 * hand-written native table geometry (what Rust publishes in `view.tables`), so the static
 * merge resolver is checked against an independent expectation, not against itself.
 */
import {describe,expect,it} from "vitest";
import {render} from "../../breditor-experimental-rich-content/src/render.js";
import {presentationModel} from "../../breditor-experimental-rich-content/src/model.js";
import {createStandardRichInlinePresentationV1} from "../../breditor-experimental-rich-content/src/standard_inline_v1.js";
import type {RichView} from "../../breditor-experimental-rich-content/src/core.js";
import {renderStaticDocument,staticInlineCatalogV1,staticInlineRecipesV1} from "../src/static_document.js";
import {fingerprint,fullDocument} from "./static_document_fixture.js";

const catalogJson=JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"breditor/rich-test",version:1,fingerprint},
 formats:[...staticInlineCatalogV1].sort((a,b)=>a.kind<b.kind?-1:1)});
const cell=(row:string,column:string)=>({table:"t1",row,column});
const self=(row:string,column:string)=>({base:cell(row,column),master:cell(row,column),rowSpan:1,columnSpan:1,sources:[cell(row,column)]});
const covered=(row:string,column:string)=>({base:cell(row,column),master:cell("r2","a"),rowSpan:0,columnSpan:0,sources:[]});
const tables:RichView["tables"]=[{id:"t1",hidden:false,rows:["r1","r2","r3"],columns:[{id:"a",width:120},{id:"b",width:96},{id:"c",width:200}],cells:[
 self("r1","a"),self("r1","b"),self("r1","c"),
 {base:cell("r2","a"),master:cell("r2","a"),rowSpan:2,columnSpan:2,sources:[cell("r2","a"),cell("r2","b"),cell("r3","a"),cell("r3","b")]},covered("r2","b"),self("r2","c"),
 covered("r3","a"),covered("r3","b"),self("r3","c"),
]}];

type Canon=string|[string,Record<string,string>,...Canon[]];
/** Strip editing affordances only; every remaining element, attribute and text must match. */
function canon(node:Node):Canon|undefined {
 if(node.nodeType===node.TEXT_NODE)return node.textContent??"";
 if(!(node instanceof HTMLElement))return undefined;
 if(node.tagName==="BUTTON")return undefined;
 const attributes:Record<string,string>={};
 for(const attribute of node.attributes){
  if(["contenteditable","draggable","tabindex","aria-readonly","checked","disabled","data-node-selected","data-selected","data-select-node"].includes(attribute.name))continue;
  attributes[attribute.name]=attribute.name==="style"?node.style.cssText.split(";").map(part=>part.trim()).filter(Boolean).sort().join(";"):attribute.value;
 }
 if(node instanceof HTMLInputElement){attributes["checked"]=String(node.checked);attributes["disabled"]=String(node.disabled);}
 return [node.tagName.toLowerCase(),attributes,...[...node.childNodes].flatMap(child=>{const value=canon(child);return value===undefined?[]:[value];})];
}

describe("static renderer parity with the live rich DOM renderer",()=>{
 it("compiles the identical standard inline V1 recipe table",()=>{
  expect(staticInlineRecipesV1).toEqual(createStandardRichInlinePresentationV1(catalogJson).recipesOuterToInner);
 });
 it("matches the live presentation structure for every node type",()=>{
  const document=fullDocument(),resolveAsset=({image}:{image:string})=>image==="i1"?"https://cdn.example/i1.png":undefined;
  const view={format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify(document),readOnly:true,selection:null,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:0,grid:null,tables} as RichView;
  const live=globalThis.document.createElement("div");
  render(live,presentationModel(view,"original"),{inlinePresentation:createStandardRichInlinePresentationV1(catalogJson),resolveAsset});
  const host=globalThis.document.createElement("div");host.innerHTML=renderStaticDocument(document,{fragment:true,resolveAsset});
  live.normalize();host.normalize();
  const expected=[...live.childNodes].map(canon),actual=[...host.childNodes].map(canon);
  expect(actual).toEqual(expected);
  // Live checkboxes are disabled in read-only mode, the static ones always.
  expect(host.querySelectorAll("input[disabled]")).toHaveLength(2);
  expect(host.querySelectorAll("[contenteditable],button")).toHaveLength(0);
 });
});
