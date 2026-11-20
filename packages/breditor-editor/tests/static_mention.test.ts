// @vitest-environment jsdom
import {describe,expect,it} from "vitest";
import {renderStaticDocument,StaticDocumentError} from "../src/static_document.js";
import {render} from "../../breditor-experimental-rich-content/src/render.js";
import {presentationModel} from "../../breditor-experimental-rich-content/src/model.js";
import type {RichView} from "../../breditor-experimental-rich-content/src/core.js";
import {envelope,p,type Json} from "./static_document_fixture.js";

const mention=(kind:string,id:string,label:string)=>({type:"breditor/mention",properties:{"breditor/mention-id":id,"breditor/mention-kind":kind,"breditor/mention-label":label}});
const ann=mention("user","u-1","Ann"),strong={type:"breditor/strong",properties:{}};
const run=(text:string,formats:Json[]=[])=>({kind:"text",text,formats}) as Json;
const html=(children:Json[])=>renderStaticDocument(envelope(children),{fragment:true});
const code=(run:()=>unknown):string=>{try{run();}catch(error){expect(error).toBeInstanceOf(StaticDocumentError);return (error as StaticDocumentError).code;}throw new Error("expected a StaticDocumentError");};

describe("static renderer: candidate rich V4 mentions",()=>{
 it("renders each whole mention as one inert chip with the stored label and no link",()=>{
  expect(html([p("a",[run("Hi "),run("@Ann",[ann]),run(" & "),run("@<b>",[mention("tag","t-1","<b>")])])])).toBe(
   '<p data-rich-block="a" data-rich-text="a">Hi <span class="breditor-mention" data-mention-kind="user" data-mention-id="u-1">@Ann</span> &amp; <span class="breditor-mention" data-mention-kind="tag" data-mention-id="t-1">@&lt;b&gt;</span></p>');
  expect(html([p("a",[run("@Ann@Ann",[ann])])])).toBe(
   '<p data-rich-block="a" data-rich-text="a"><span class="breditor-mention" data-mention-kind="user" data-mention-id="u-1">@Ann</span><span class="breditor-mention" data-mention-kind="user" data-mention-id="u-1">@Ann</span></p>');
  expect(html([p("a",[run("@A",[ann]),run("nn",[ann,strong])])])).toContain('<span class="breditor-mention" data-mention-kind="user" data-mention-id="u-1">@A<strong data-rich-format="breditor/strong">nn</strong></span>');
  expect(html([p("a",[run("@Ann",[ann])])])).not.toContain("<a");
 });
 it("rejects out-of-domain values and partial mention text",()=>{
  for(const format of [mention("team","u","A"),mention("user","u 1","A"),mention("user","u","A\n"),mention("user","u"," A"),{type:"breditor/mention",properties:{"breditor/mention-id":"u","breditor/mention-kind":"user"}}])
   expect(code(()=>html([p("a",[run("@A",[format])])]))).toBe("format");
  for(const runs of [[run("@An",[ann])],[run("Ann",[ann])],[run("@Ann@A",[ann])],[run("@A",[ann]),run("x"),run("nn",[ann])]])
   expect(code(()=>html([p("a",runs)]))).toBe("grammar");
  expect(code(()=>html([{kind:"element",type:"breditor/code-block",entityId:null,properties:{"breditor/block-id":"c"},children:[run("@Ann",[ann])]} as Json]))).toBe("grammar");
 });
 it("matches the live renderer's chips (minus the contenteditable island)",()=>{
  const document=envelope([p("a",[run("Hi "),run("@A",[ann]),run("nn",[ann,strong]),run(" and "),run("@Plan",[mention("page","p:7","Plan")])]),p("b",[run("plain")])]);
  const view={format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify(document),readOnly:true,selection:null,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:0,grid:null,tables:[]} as unknown as RichView;
  const live=globalThis.document.createElement("div");render(live,presentationModel(view,"original"),{});
  for(const chip of live.querySelectorAll(".breditor-mention")){expect(chip.getAttribute("contenteditable")).toBe("false");chip.removeAttribute("contenteditable");}
  const host=globalThis.document.createElement("div");host.innerHTML=renderStaticDocument(document,{fragment:true});
  const chips=(root:Element)=>[...root.querySelectorAll(".breditor-mention")].map(chip=>chip.outerHTML);
  expect(chips(host)).toEqual(chips(live));expect(chips(host)).toHaveLength(2);
  expect([...host.querySelectorAll("p")].map(p=>p.textContent)).toEqual([...live.querySelectorAll("p")].map(p=>p.textContent));
 });
});
