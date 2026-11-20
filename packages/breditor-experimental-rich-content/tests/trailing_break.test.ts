// @vitest-environment jsdom
import {afterEach,describe,expect,it} from "vitest";
import {render,endsWithLineBreak,trailingBreakAttribute} from "../src/render.js";
import {presentationModel} from "../src/model.js";
import {readNative,readTarget,restoreNative} from "../src/selection.js";
import type {RichView} from "../src/core.js";

// A trailing hard break (LF) gets a presentation-only `<br data-rich-trailing-break>` so the
// position after the LF is a real native caret position; it never changes model offsets.
const fingerprint=`sha256:${"ab".repeat(32)}`;
const strong={type:"breditor/strong",properties:{}};
const run=(text:string,formats:unknown[]=[])=>({kind:"text",text,formats});
const el=(type:string,block:string,children:unknown[],properties:Record<string,unknown>={})=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block,...properties},children});
function view(children:unknown[]):RichView{
 const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"d"},children};
 return {format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"breditor/rich-test",version:1},schemaFingerprint:fingerprint,root}),readOnly:false,selection:null,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:"100",tables:[]} as unknown as RichView;
}
function live(children:unknown[]):HTMLElement{
 const surface=document.createElement("div");document.body.append(surface);render(surface,presentationModel(view(children),"original"),{});return surface;
}
const block=(surface:HTMLElement,id:string)=>surface.querySelector<HTMLElement>(`[data-rich-text="${id}"]`)!;
const anchors=(element:Element)=>element.querySelectorAll(`br[${trailingBreakAttribute}]`).length;
afterEach(()=>{document.body.replaceChildren();document.getSelection()?.removeAllRanges();});

describe("trailing hard-break caret anchor",()=>{
 it("detects only a final LF in the last text run",()=>{
  expect(endsWithLineBreak([])).toBe(false);
  expect(endsWithLineBreak([run("abc")] as never)).toBe(false);
  expect(endsWithLineBreak([run("a\nbc")] as never)).toBe(false);
  expect(endsWithLineBreak([run("abc\n")] as never)).toBe(true);
  expect(endsWithLineBreak([run("abc\n"),run("d")] as never)).toBe(false);
  expect(endsWithLineBreak([run("a"),run("\n\n",[strong])] as never)).toBe(true);
 });
 it("renders one anchor after paragraphs, headings, summaries and code ending in LF, and none otherwise",()=>{
  const surface=live([
   el("paragraph","p",[run("abc\n")]),el("paragraph","mid",[run("a\nbc")]),el("paragraph","empty",[]),
   el("heading","h",[run("Title\n")],{"breditor/level":2}),el("paragraph","f",[run("a"),run("b\n",[strong])]),
   el("code-block","c",[run("let x;\n")]),
   el("details","d",[el("details-summary","s",[run("Sum\n")]),el("paragraph","b",[run("Body")])],{"breditor/details-open":true}),
  ]);
  expect(anchors(block(surface,"p"))).toBe(1);expect(block(surface,"p").lastChild).toBeInstanceOf(HTMLBRElement);
  expect(anchors(block(surface,"mid"))).toBe(0);
  // The empty-block placeholder `<br>` is unchanged and carries no anchor attribute.
  expect(block(surface,"empty").innerHTML).toBe("<br>");
  expect(anchors(block(surface,"h"))).toBe(1);
  // The anchor sits outside inline format wrappers.
  const formatted=block(surface,"f");expect(formatted.lastChild?.nodeName).toBe("BR");expect(formatted.querySelector("strong br")).toBeNull();
  expect(block(surface,"c").querySelector(`code > br[${trailingBreakAttribute}]:last-child`)).not.toBeNull();
  expect(anchors(block(surface,"s"))).toBe(1);expect(anchors(block(surface,"b"))).toBe(0);
  // Text is unchanged: the anchor adds no characters.
  for(const [id,text] of [["p","abc\n"],["h","Title\n"],["f","ab\n"],["c","let x;\n"],["s","Sum\n"]])expect(block(surface,id!).textContent).toBe(text);
 });
 it("covers image and table caption paragraphs",()=>{
  const surface=live([el("image","img",[el("paragraph","cap",[run("xy\n")])],{"breditor/image-id":"i","breditor/asset-id":"a","breditor/asset-generation":"1","breditor/alt-text":""})]);
  expect(surface.querySelector(`figcaption [data-rich-text="cap"] > br[${trailingBreakAttribute}]`)).not.toBeNull();
 });
 it("maps the caret after the LF to the model offset after it, from every DOM spelling",()=>{
  const surface=live([el("paragraph","p",[run("abc\n")])]),p=block(surface,"p"),text=p.firstChild!,model=presentationModel(view([el("paragraph","p",[run("abc\n")])]),"original");
  const native=document.getSelection()!;
  const at=(node:Node,offset:number)=>{native.setBaseAndExtent(node,offset,node,offset);const selection=readNative(surface,model);return selection?.kind==="text"?[selection.focus.block,selection.focus.offset]:null;};
  // Text offset 4, the block point before the anchor (Chromium/WebKit target ranges) and after it.
  expect(at(text,4)).toEqual(["p","4"]);expect(at(p,1)).toEqual(["p","4"]);expect(at(p,2)).toEqual(["p","4"]);
  expect(at(text,3)).toEqual(["p","3"]);
  expect(readTarget(surface,new StaticRange({startContainer:p,startOffset:1,endContainer:p,endOffset:1}))?.focus.offset).toBe("4");
  // Restoring offset 4 places the native caret inside the text after the LF, before the anchor.
  restoreNative(surface,{kind:"text",anchor:{block:"p",offset:"4",affinity:"after"},focus:{block:"p",offset:"4",affinity:"after"}});
  expect([native.focusNode,native.focusOffset]).toEqual([text,4]);
  // Two trailing LFs: still one anchor and exact offsets.
  const twice=live([el("paragraph","q",[run("abc\n\n")])]),q=block(twice,"q");
  expect(anchors(q)).toBe(1);
  const model2=presentationModel(view([el("paragraph","q",[run("abc\n\n")])]),"original");
  native.setBaseAndExtent(q,1,q,1);const read=readNative(twice,model2);expect(read?.kind==="text"&&read.focus.offset).toBe("5");
 });
});
