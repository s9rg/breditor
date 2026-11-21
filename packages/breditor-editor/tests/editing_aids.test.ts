import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {RichDomEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {render} from "../../breditor-experimental-rich-content/src/render.js";
import {presentationModel} from "../../breditor-experimental-rich-content/src/model.js";
import {mountRichEditingAids,mountRichEditingAidsControls,richBlockLabel,richFocusedBlockAttribute,type RichEditingAids} from "../../breditor-experimental-rich-content/src/editing_aids.js";
import {resolveRichUi,richUiStringsEn} from "../../breditor-experimental-rich-content/src/ui_locale.js";
import type {RichCoreEditor,RichView,RichSelection,RichCommand} from "../../breditor-experimental-rich-content/src/core.js";
import {arabicUi} from "./ui_locale_ar.js";

// The aids are presentation only, so a stubbed owner is enough to prove that nothing reaches it. Real Wasm
// history, clipboard and caret behavior with the aids on and off: experiments/rich-browser/editing-aids.spec.mjs.
type N={kind:"element";type:string;entityId:null;properties:Record<string,unknown>;children:(N|{kind:"text";text:string;formats:[]})[]};
const el=(type:string,block:string,children:N["children"]=[],extra:Record<string,unknown>={}):N=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block,...Object.fromEntries(Object.entries(extra).map(([k,v])=>[`breditor/${k}`,v]))},children});
const t=(text:string)=>({kind:"text" as const,text,formats:[] as []});
/** Spaces, a no-break space, a tab, a mid-text hard break and a trailing hard break across the block kinds. */
function tree():N{
 const root=el("document","root",[
  el("heading","h",[t("Title one")],{level:2}),
  el("paragraph","p",[t("a b c\td\ne")]),
  el("bullet-list","L",[el("list-item","li",[el("paragraph","lp",[t("Item")])])]),
  el("blockquote","Q",[el("paragraph","qp",[t("Quoted")])]),
  el("code-block","code",[t("x y")]),
  el("paragraph","tail",[t("end\n")]),
  el("paragraph","empty"),
 ]);
 root.properties={"breditor/document-id":"room"};return root;
}
const caret=(block:string,offset=0):RichSelection=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
function fixture(){
 const root=tree();let revision=1,selection:RichSelection|null=caret("p");
 const view=():RichView=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson:JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/editing-aids",version:1},schemaFingerprint:"fixture",root}),selection,pendingFormatsJson:null,undoDepth:3,redoDepth:0,historyCapacity:100,historyGrouping:"typing-v1",grid:null,tables:[]}) as unknown as RichView;
 const closeTypingGroup=vi.fn(()=>false);
 const execute=vi.fn((command:RichCommand)=>{if(command.kind==="setSelection"){selection=command.selection;revision++;return "selection";}throw Error(`unexpected ${command.kind}`);});
 const core={view,supportsTypingHistory:()=>true,closeTypingGroup,execute,clipboard:vi.fn(()=>({plainText:"a b",structuredJson:"{\"opaque\":1}"})),dispose:vi.fn()} as unknown as RichCoreEditor;
 const host=document.createElement("div");document.body.append(host);
 const dom=new RichDomEditor(host,{core,toolbar:[]});
 return {core,dom,host,execute,closeTypingGroup,contentCommands:()=>execute.mock.calls.filter(([command])=>command.kind!=="setSelection")};
}
const frames:FrameRequestCallback[]=[];
const flush=()=>{while(frames.length)frames.shift()!(0);};
const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON(){return this;}}) as DOMRect;
beforeEach(()=>{
 frames.length=0;vi.spyOn(window,"requestAnimationFrame").mockImplementation(callback=>{frames.push(callback);return frames.length;});
 // jsdom has no layout: give every element a box and every range one 6×16 rectangle per character.
 vi.spyOn(Element.prototype,"getBoundingClientRect").mockImplementation(function(this:Element){return this.classList.contains("breditor-rich-surface")?rect(0,0,800,600):rect(10,10,400,20);});
 Object.assign(Range.prototype,{getClientRects(this:Range){return [rect(20+this.startOffset*6,12,6,16)];},getBoundingClientRect(){return rect(20,12,60,16);}});
});
afterEach(()=>{document.body.replaceChildren();document.head.replaceChildren();vi.restoreAllMocks();});
const markers=(aids:RichEditingAids,kind?:string)=>[...aids.overlay.querySelectorAll<HTMLElement>(kind?`.breditor-aid-char[data-aid-kind="${kind}"]`:".breditor-aid-char")];
const copy=(surface:HTMLElement)=>{const values=new Map<string,string>(),event=new Event("copy",{bubbles:true,cancelable:true});Object.defineProperty(event,"clipboardData",{value:{get types(){return [...values.keys()];},setData:(type:string,value:string)=>values.set(type,value),getData:(type:string)=>values.get(type)??""}});surface.dispatchEvent(event);return JSON.stringify([...values]);};

describe("editing aids",()=>{
 it("toggling never reaches the owner and leaves the editable DOM, view, history and Copy unchanged",()=>{
  const f=fixture();const before={html:f.dom.surface.innerHTML,view:JSON.stringify(f.core.view()),copy:copy(f.dom.surface)},closes=f.closeTypingGroup.mock.calls.length;
  const aids=mountRichEditingAids(f.dom);flush();
  expect(aids.overlay.childElementCount).toBe(0);
  for(let round=0;round<3;round++){aids.toggleShowBlocks();aids.toggleInvisibles();flush();aids.toggleShowBlocks();aids.toggleInvisibles();flush();}
  aids.setShowBlocks(true);aids.setInvisibles(true);flush();
  expect(aids.overlay.querySelectorAll(".breditor-aid-block").length).toBeGreaterThan(0);expect(markers(aids).length).toBeGreaterThan(0);
  expect(f.contentCommands()).toEqual([]);expect(f.closeTypingGroup).toHaveBeenCalledTimes(closes);
  expect(f.dom.surface.innerHTML).toBe(before.html);expect(JSON.stringify(f.core.view())).toBe(before.view);expect(f.core.view().undoDepth).toBe(3);
  expect(copy(f.dom.surface)).toBe(before.copy);
  // The layer is outside the editable surface, hidden from assistive technology and inert to the pointer.
  expect(f.dom.surface.contains(aids.overlay)).toBe(false);expect(aids.overlay.getAttribute("aria-hidden")).toBe("true");
  expect(document.head.querySelector("[data-breditor-editing-aids-styles]")!.textContent).toContain("pointer-events:none");
  expect(f.dom.surface.querySelector("[data-breditor-focused]")).toBeNull();
  aids.dispose();expect(aids.overlay.isConnected).toBe(false);expect(document.querySelector("[data-breditor-editing-aids-styles]")).toBeNull();
  expect(f.dom.surface.innerHTML).toBe(before.html);
  mountRichEditingAids(f.dom).dispose();
 });

 it("outlines and labels every rendered block kind through the catalog",()=>{
  const f=fixture(),aids=mountRichEditingAids(f.dom,{showBlocks:true});flush();
  const labels=Object.fromEntries([...aids.overlay.querySelectorAll<HTMLElement>(".breditor-aid-label")].map(label=>[label.dataset["aidLabel"],label.textContent]));
  expect(labels).toEqual({h:"Heading 2",p:"Paragraph",L:"Bulleted list",li:"List item",lp:"Paragraph",Q:"Quote",qp:"Paragraph",code:"Code block",tail:"Paragraph",empty:"Paragraph"});
  expect(aids.overlay.querySelectorAll(".breditor-aid-block")).toHaveLength(10);
  aids.dispose();
  const arabic=mountRichEditingAids(f.dom,{showBlocks:true,ui:arabicUi});flush();
  expect(arabic.overlay.querySelector('[data-aid-label="h"]')!.textContent).toBe("عنوان 2");
  arabic.dispose();
  // Every other rendered kind, read from real render() output (local and shared editors share the renderer).
  const surface=document.createElement("div"),ui=resolveRichUi();
  const doc=el("document","r",[el("ordered-list","ol",[el("list-item","oi",[el("paragraph","op",[t("1")])])],{start:1}),el("task-list","tl",[el("task-item","ti",[el("paragraph","tp",[t("todo")])],{checked:false})]),el("horizontal-rule","hr"),el("details","d",[el("details-summary","s",[t("More")]),el("paragraph","dp",[t("Body")])],{"details-open":true}),el("page-break","pb")]);
  doc.properties={"breditor/document-id":"room"};
  const value=presentationModel({format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"s",version:1},schemaFingerprint:"f",root:doc}),selection:null,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:1,grid:null,tables:[]} as unknown as RichView,"original");
  render(surface,value,{});
  const read=(block:string)=>richBlockLabel(surface.querySelector(`[data-rich-block="${block}"]`)!,ui);
  expect(["ol","oi","tl","ti","hr","d","s","pb"].map(read)).toEqual(["Numbered list","List item","Task list","Task","Horizontal line","Collapsible section","Section summary","Page break"]);
  const table=document.createElement("table"),caption=document.createElement("caption"),p=document.createElement("p");caption.append(p);table.append(caption);
  expect([richBlockLabel(table,ui),richBlockLabel(p,ui),richBlockLabel(document.createElement("figure"),ui),richBlockLabel(document.createElement("div"),ui)]).toEqual(["Table","Caption","Image","Block"]);
  expect(richUiStringsEn.aidsShowBlocks).toBe("Show blocks");
 });

 it("marks spaces, no-break spaces, tabs, hard breaks and block ends with configurable glyphs",()=>{
  const f=fixture(),aids=mountRichEditingAids(f.dom,{invisibles:true});flush();
  const count=(kind:string)=>markers(aids,kind).length;
  // "Title one", "a b c\td\ne", "x y": three spaces; one NBSP; one tab; the mid-text and trailing hard breaks.
  expect([count("space"),count("nbsp"),count("tab"),count("hardBreak")]).toEqual([3,1,1,2]);
  // One paragraph mark per text block (h, p, lp, qp, code, tail, empty).
  expect(count("blockEnd")).toBe(7);
  expect(markers(aids,"space")[0]!.textContent).toBe("·");expect(markers(aids,"nbsp")[0]!.textContent).toBe("°");expect(markers(aids,"blockEnd")[0]!.textContent).toBe("¶");
  aids.dispose();
  const custom=mountRichEditingAids(f.dom,{invisibles:true,kinds:["nbsp","blockEnd"],glyphs:{blockEnd:"⏎"}});flush();
  expect(markers(custom).map(marker=>marker.dataset["aidKind"]).sort()).toEqual(["blockEnd","blockEnd","blockEnd","blockEnd","blockEnd","blockEnd","blockEnd","nbsp"]);
  expect(markers(custom,"blockEnd")[0]!.textContent).toBe("⏎");
  // Composition suspends glyph painting so an IME never races repositioned markers.
  f.dom.surface.dispatchEvent(new Event("compositionstart"));flush();expect(markers(custom)).toHaveLength(0);
  f.dom.surface.dispatchEvent(new Event("compositionend"));flush();expect(markers(custom).length).toBe(8);
  custom.dispose();
  const bounded=mountRichEditingAids(f.dom,{invisibles:true,maxMarkers:4});flush();expect(markers(bounded)).toHaveLength(4);bounded.dispose();
 });

 it("rejects malformed options before mounting anything",()=>{
  const f=fixture();
  for(const options of [{kinds:["zero-width"]},{glyphs:{space:""}},{glyphs:{space:"12345"}},{glyphs:{tab:"\u0007"}},{glyphs:{other:"x"}},{maxMarkers:0},{maxMarkers:70000},{showBlocks:"yes"},{shortcuts:1},{nonce:""}])
   expect(()=>mountRichEditingAids(f.dom,options as never)).toThrow();
  expect(document.querySelector("[data-breditor-editing-aids]")).toBeNull();
  const aids=mountRichEditingAids(f.dom);expect(()=>mountRichEditingAids(f.dom)).toThrow("already mounted");aids.dispose();
  expect(()=>aids.setShowBlocks(true)).toThrow("disposed");
 });

 it("captures the toggle shortcuts before the editor so they never close a typing group",()=>{
  const f=fixture(),changes:unknown[]=[],aids=mountRichEditingAids(f.dom,{onChange:state=>changes.push(state)});
  const key=(code:string,init:KeyboardEventInit)=>{const event=new KeyboardEvent("keydown",{code,key:code.slice(3).toLowerCase(),bubbles:true,cancelable:true,...init});f.dom.surface.dispatchEvent(event);return event;};
  const toggled=key("KeyB",{ctrlKey:true,altKey:true,shiftKey:true});
  expect(toggled.defaultPrevented).toBe(true);expect(aids.state().showBlocks).toBe(true);
  key("KeyP",{metaKey:true,altKey:true,shiftKey:true});expect(aids.state().invisibles).toBe(true);
  expect(f.closeTypingGroup).not.toHaveBeenCalled();expect(f.contentCommands()).toEqual([]);
  expect(changes).toEqual([{showBlocks:true,invisibles:false,focus:false,disposed:false},{showBlocks:true,invisibles:true,focus:false,disposed:false}]);
  // Without Shift (or without Alt) the chord is the editor's, as before.
  key("KeyB",{ctrlKey:true,altKey:true});expect(aids.state().showBlocks).toBe(true);expect(f.closeTypingGroup).toHaveBeenCalled();
  aids.dispose();
  const off=mountRichEditingAids(f.dom,{shortcuts:false});key("KeyB",{ctrlKey:true,altKey:true,shiftKey:true});expect(off.state().showBlocks).toBe(false);off.dispose();
 });

 it("mounts accessible toggle buttons in the editor toolbar",()=>{
  const f=fixture(),aids=mountRichEditingAids(f.dom,{ui:arabicUi});
  expect(()=>mountRichEditingAidsControls(f.dom.surface,aids)).toThrow("outside editable content");
  const controls=mountRichEditingAidsControls(f.dom.toolbar,aids);
  const [blocks,invisibles]=[...controls.element.querySelectorAll("button")];
  expect(controls.element.getAttribute("role")).toBe("group");expect(controls.element.getAttribute("aria-label")).toBe("أدوات مساعدة للتحرير");expect(controls.element.dir).toBe("rtl");
  expect([blocks!.textContent,blocks!.getAttribute("aria-pressed"),blocks!.getAttribute("aria-keyshortcuts")]).toEqual(["إظهار الكتل","false","Control+Alt+Shift+B Meta+Alt+Shift+B"]);
  const down=new Event("pointerdown",{bubbles:true,cancelable:true});invisibles!.dispatchEvent(down);expect(down.defaultPrevented).toBe(true);
  invisibles!.click();expect(invisibles!.getAttribute("aria-pressed")).toBe("true");expect(aids.state().invisibles).toBe(true);
  aids.setShowBlocks(true);expect(blocks!.getAttribute("aria-pressed")).toBe("true");
  expect(f.contentCommands()).toEqual([]);
  controls.dispose();expect(f.dom.toolbar.contains(controls.element)).toBe(false);expect(aids.state().invisibles).toBe(true);
  aids.dispose();
 });

 it("marks only the innermost focused block with an attribute and never its text",()=>{
  const f=fixture(),text=f.dom.surface.textContent,aids=mountRichEditingAids(f.dom,{focus:true});
  const focusIn=(block:string)=>{const node=f.dom.surface.querySelector(`[data-rich-block="${block}"]`)!.firstChild!;document.getSelection()!.collapse(node,0);document.dispatchEvent(new Event("selectionchange"));};
  focusIn("lp");
  expect([...f.dom.surface.querySelectorAll(`[${richFocusedBlockAttribute}]`)].map(element=>(element as HTMLElement).dataset["richBlock"])).toEqual(["lp"]);
  focusIn("qp");
  expect([...f.dom.surface.querySelectorAll(`[${richFocusedBlockAttribute}]`)].map(element=>(element as HTMLElement).dataset["richBlock"])).toEqual(["qp"]);
  expect(f.dom.surface.textContent).toBe(text);
  aids.setFocus(false);expect(f.dom.surface.querySelector(`[${richFocusedBlockAttribute}]`)).toBeNull();
  aids.setFocus(true);expect(f.dom.surface.querySelectorAll(`[${richFocusedBlockAttribute}]`)).toHaveLength(1);
  aids.dispose();expect(f.dom.surface.querySelector(`[${richFocusedBlockAttribute}]`)).toBeNull();
  expect(f.contentCommands()).toEqual([]);
 });
});
