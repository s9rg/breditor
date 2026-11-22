// @vitest-environment jsdom
import {afterEach,describe,expect,it} from "vitest";
import {render,applyRestrictedPresentation,richRestrictedEditingStyles} from "../src/render.js";
import {presentationModel} from "../src/model.js";
import type {RichView} from "../src/core.js";

// Restricted editing marks editable regions in the DOM only; enforcement is native.
const fingerprint=`sha256:${"ab".repeat(32)}`;
const run=(text:string)=>({kind:"text",text,formats:[]});
const el=(type:string,block:string,children:unknown[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block},children});
function view(restricted?:RichView["restricted"]):RichView{
 const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children:[el("paragraph","intro",[run("Intro")]),el("paragraph","field",[run("Name")]),el("paragraph","tail",[run("Tail")])]};
 return {format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"breditor/rich-test",version:1},schemaFingerprint:fingerprint,root}),selection:null,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,tables:[],grid:null,...(restricted?{restricted}:{})} as unknown as RichView;
}
const marked=(surface:HTMLElement)=>[...surface.querySelectorAll<HTMLElement>("[data-rich-editable-region]")].map(element=>element.dataset["richBlock"]);
afterEach(()=>document.body.replaceChildren());

describe("restricted editing presentation",()=>{
 it("marks exactly the native editable regions and keeps default output unchanged",()=>{
  const plain=document.createElement("div"),restricted=document.createElement("div");document.body.append(plain,restricted);
  render(plain,presentationModel(view(),"original"),{});
  expect(plain.hasAttribute("data-rich-restricted")).toBe(false);expect(marked(plain)).toEqual([]);
  render(restricted,presentationModel(view({editable:["field","tail"],selectionEditable:false}),"original"),{});
  expect(restricted.hasAttribute("data-rich-restricted")).toBe(true);expect(marked(restricted)).toEqual(["field","tail"]);
  // The surface itself stays one contenteditable host: regions are not nested islands.
  expect(restricted.contentEditable).toBe("true");
  expect(restricted.querySelectorAll("[contenteditable]").length).toBe(0);
  // Removing the policy clears every marker.
  applyRestrictedPresentation(restricted,presentationModel(view(),"original"));
  expect(restricted.hasAttribute("data-rich-restricted")).toBe(false);expect(marked(restricted)).toEqual([]);
  expect(plain.innerHTML).toBe(restricted.innerHTML);
 });
 it("ships an overridable presentation-only stylesheet",()=>{
  expect(richRestrictedEditingStyles).toContain("[data-rich-restricted] [data-rich-editable-region]");
 });
});
