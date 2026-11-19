// @vitest-environment jsdom
import {describe,expect,it} from "vitest";
import {render} from "../src/render.js";
import {presentationModel} from "../src/model.js";
import {detailsToolbarControls,detailsInterval,selectedDetails} from "../src/details.js";
import {boundaryDelete,enter,positionAfter,type ActionContext} from "../src/actions.js";
import {createRichToolbarV4} from "../src/rich_toolbar_v4.js";
import {createLayoutRichToolbarV3} from "../src/layout_toolbar_v3.js";
import {createRichSlashCommands} from "../src/slash_command_items.js";
import {resolveRichBlockMove,richHandleBlock} from "../src/block_move.js";
import {createStandardRichInlinePresentationV1} from "../src/standard_inline_v1.js";
import type {RichCoreEditor,RichView} from "../src/core.js";
import {staticInlineCatalogV4} from "../../breditor-editor/src/static_document.js";

const fingerprint=`sha256:${"ef".repeat(32)}`;
const catalogJson=JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"breditor/rich-test",version:1,fingerprint},formats:[...staticInlineCatalogV4].sort((a,b)=>a.kind<b.kind?-1:1)});
const el=(type:string,properties:Record<string,unknown>,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v])),children});
const run=(text:string)=>text?[{kind:"text",text,formats:[]}]:[];
const p=(id:string,text:string)=>el("paragraph",{"block-id":id},run(text));
const section=(open:boolean)=>el("details",{"block-id":"d",...(open?{"details-open":true}:{})},[el("details-summary",{"block-id":"s"},run("Title")),p("b1","Body one"),p("b2","Body two")]);
const json=(open=true)=>JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"breditor/rich-test",version:1},schemaFingerprint:fingerprint,root:el("document",{"document-id":"doc"},[p("p","Before"),section(open),p("q","After")])});
const caret=(block:string,offset:number):RichView["selection"]=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
function view(documentJson:string,selection:RichView["selection"],readOnly=false):RichView{
 return {format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson,readOnly,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[]} as unknown as RichView;
}
const model=(selection:RichView["selection"],open=true,readOnly=false)=>presentationModel(view(json(open),selection,readOnly),"original");
const owner=(language:1|2|3|4,capable=language===4)=>({supportsStandardInlineControls:()=>true,caretFormats:()=>[],inlineFormatState:(kind:string)=>({format:"breditor/rich-inline-format-state",formatVersion:1,formatKind:kind,schema:{name:"breditor/rich-test",version:1,fingerprint},state:{kind:"unset"}}),richLanguageVersion:()=>language,supportsListNumbering:()=>capable,supportsTextLanguage:()=>capable,supportsImageLinks:()=>capable,supportsDetails:()=>capable,supportsBlockLayout:()=>language>=3,blockLayoutState:()=>({format:"breditor/rich-block-layout-state",formatVersion:1,schema:{name:"t",version:1,fingerprint},blocks:"0",alignment:{kind:"unavailable"},direction:{kind:"unavailable"},indent:{kind:"unavailable"},lineHeightPercent:{kind:"unavailable"}})}) as unknown as RichCoreEditor;
let next=0;
const context=(core:RichCoreEditor|undefined,selection:RichView["selection"],open=true):ActionContext=>({core,model:model(selection,open),allocate:kind=>`${kind}-${++next}`,stamp:()=>({replica:"1",counter:"1",lamport:"1"})});

describe("candidate rich V4 collapsible section rendering",()=>{
 it("renders native details/summary with open mirroring document state",()=>{
  for(const open of [true,false]){
   const surface=document.createElement("div");render(surface,model(caret("p",0),open),{});
   const details=surface.querySelector<HTMLDetailsElement>("details[data-rich-details]")!;
   expect(details.dataset["richBlock"]).toBe("d");expect(details.open).toBe(open);
   const summary=details.firstElementChild as HTMLElement;
   expect(summary.tagName).toBe("SUMMARY");expect(summary.dataset["richText"]).toBe("s");expect(summary.textContent).toBe("Title");
   expect([...details.children].slice(1).map(n=>(n as HTMLElement).dataset["richBlock"])).toEqual(["b1","b2"]);
  }
  // An empty summary keeps a caret line.
  const empty=JSON.parse(json()) as {root:{children:{children:{children:unknown[]}[]}[]}};empty.root.children[1]!.children[0]!.children=[];
  const surface=document.createElement("div");render(surface,presentationModel(view(JSON.stringify(empty),caret("p",0)),"original"),{});
  expect(surface.querySelector("summary")!.innerHTML).toBe("<br>");
 });
});

describe("candidate rich V4 collapsible section controls",()=>{
 it("binds only to an explicit V4 owner and prepares wrap, unwrap and toggle",()=>{
  const core=owner(4);
  expect(()=>detailsToolbarControls(owner(3))).toThrow();
  expect(()=>detailsToolbarControls(owner(4,false))).toThrow();
  const presentation=createStandardRichInlinePresentationV1(catalogJson);
  const ids=createRichToolbarV4(core,presentation).map(c=>c.id);
  expect(ids).toEqual(expect.arrayContaining(["details","undetails","details-open"]));
  expect(createLayoutRichToolbarV3(owner(3),presentation).map(c=>c.id)).not.toContain("details");
  const [wrap,unwrap,toggle]=detailsToolbarControls(core);
  const outside=context(core,caret("p",2));
  expect(wrap!.enabled(outside)).toBe(true);
  expect(wrap!.command(outside)).toMatchObject({kind:"wrapDetails",data:{first:"p",last:"p",open:true}});
  expect(unwrap!.enabled(outside)).toBe(false);
  // A summary caret cannot be wrapped; it targets its own section.
  const inSummary=context(core,caret("s",1));
  expect(detailsInterval(inSummary.model)).toBeUndefined();expect(wrap!.enabled(inSummary)).toBe(false);
  expect(selectedDetails(inSummary.model)?.properties["breditor/block-id"]).toBe("d");
  expect(unwrap!.command(inSummary)).toEqual({kind:"unwrapDetails",data:{wrapper:"d"}});
  expect(toggle!.read!(inSummary)).toEqual({kind:"uniform",pressed:true});
  expect(toggle!.command(inSummary)).toEqual({kind:"setDetailsOpen",data:{block:"d",open:false}});
  expect(toggle!.command(context(core,caret("s",1),false))).toEqual({kind:"setDetailsOpen",data:{block:"d",open:true}});
  expect(()=>toggle!.command(context(owner(4),caret("s",1)))).toThrow(/different Rust owner/);
  // The slash menu offers the section only where its control exists (V4 toolbars).
  expect(createRichSlashCommands(createRichToolbarV4(core,presentation)).map(i=>i.id)).toContain("details");
  expect(createRichSlashCommands(createLayoutRichToolbarV3(owner(3),presentation)).map(i=>i.id)).not.toContain("details");
 });
 it("maps Enter, Backspace and Delete at section boundaries to explicit commands",()=>{
  const core=owner(4);
  expect(enter(context(core,caret("s",2)))).toMatchObject({kind:"enterDetailsBody",data:{paragraph:expect.any(String)}});
  const range:RichView["selection"]={kind:"text",anchor:{block:"s",offset:"0",affinity:"after"},focus:{block:"s",offset:"2",affinity:"after"}};
  expect(enter(context(core,range))).toBeNull();
  expect(boundaryDelete(context(core,caret("s",0)),true)).toEqual({kind:"unwrapDetails",data:{wrapper:"d"}});
  expect(boundaryDelete(context(core,caret("b1",0)),true)).toEqual({kind:"setSelection",selection:{kind:"text",anchor:{block:"s",offset:"5",affinity:"before"},focus:{block:"s",offset:"5",affinity:"before"}}});
  expect(boundaryDelete(context(core,caret("s",5)),false)).toMatchObject({kind:"setSelection",selection:{anchor:{block:"b1",offset:"0"}}});
  // A collapsed body is not entered by forward Delete.
  expect(boundaryDelete(context(core,caret("s",5),false),false)).toMatchObject({kind:"setSelection",selection:{anchor:{block:"s",offset:"5"}}});
  expect(positionAfter(context(core,caret("b1",0)))).toEqual({parent:{kind:"details",block:"d"},before:"b2"});
 });
 it("moves sections whole and never moves or empties around a summary",()=>{
  const m=model(caret("p",0));
  expect(richHandleBlock(m,"s")).toBe("d");
  expect(resolveRichBlockMove(m,"s",{anchor:"p",side:"after"},"flow-v1")).toEqual({kind:"rejected",reason:"not_movable"});
  expect(resolveRichBlockMove(m,"q",{anchor:"s",side:"after"},"flow-v1")).toEqual({kind:"rejected",reason:"invalid_target"});
  expect(resolveRichBlockMove(m,"q",{anchor:"b1",side:"before"},"flow-v1")).toMatchObject({kind:"move",parent:"d",before:"b1"});
  expect(resolveRichBlockMove(m,"d",{anchor:"p",side:"before"},"flow-v1")).toMatchObject({kind:"move",parent:null,before:"p"});
  const single=JSON.parse(json()) as {root:{children:{children:unknown[]}[]}};single.root.children[1]!.children.pop();
  const one=presentationModel(view(JSON.stringify(single),caret("p",0)),"original");
  expect(resolveRichBlockMove(one,"b1",{anchor:"q",side:"after"},"flow-v1")).toEqual({kind:"rejected",reason:"empties_source"});
 });
});
