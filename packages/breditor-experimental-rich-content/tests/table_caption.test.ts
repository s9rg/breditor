// @vitest-environment jsdom
import {describe,expect,it,vi} from "vitest";
import {render} from "../src/render.js";
import {presentationModel} from "../src/model.js";
import {tableCaptionToolbarControls,tableCaptionOf,isTableCaption,selectedTableCaption} from "../src/table_caption.js";
import {boundaryDelete,enter,positionAfter,defaultToolbar,type ActionContext} from "../src/actions.js";
import {createRichToolbarV4} from "../src/rich_toolbar_v4.js";
import {createLayoutRichToolbarV3} from "../src/layout_toolbar_v3.js";
import {resolveRichBlockMove,richHandleBlock} from "../src/block_move.js";
import {structuralIntervalV2} from "../src/structural_context_v2.js";
import {readNative} from "../src/selection.js";
import {captionArrowCommands} from "../src/table_caption_navigation.js";
import {createStandardRichInlinePresentationV1} from "../src/standard_inline_v1.js";
import type {RichCoreEditor,RichView,RichWasmModule} from "../src/core.js";
import {compileStandardRichProfileV4} from "../index.js";
import {staticInlineCatalogV4} from "../../breditor-editor/src/static_document.js";

const fingerprint=`sha256:${"ef".repeat(32)}`;
const catalogJson=JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"breditor/rich-test",version:1,fingerprint},formats:[...staticInlineCatalogV4].sort((a,b)=>a.kind<b.kind?-1:1)});
const el=(type:string,properties:Record<string,unknown>,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v])),children});
const run=(text:string)=>text?[{kind:"text",text,formats:[]}]:[];
const p=(id:string,text:string)=>el("paragraph",{"block-id":id},run(text));
const columns=[{id:"a",width:120},{id:"b",width:120}];
const cell=(r:string,c:string)=>el("table-cell",{"block-id":`cell-${r}-${c}`,"column-id":c,header:false},[p(`p-${r}-${c}`,`${r}${c}`)]);
const row=(r:string)=>el("table-row",{"block-id":`row-${r}`,"row-id":r},columns.map(c=>cell(r,c.id)));
const table=(caption:boolean)=>el("table",{"block-id":"tbl","table-id":"t","columns":columns,merges:[],"retracted-merges":[]},[row("r1"),row("r2"),...(caption?[p("cap","Legend")]:[])]);
const json=(caption=true)=>JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"breditor/rich-test",version:1},schemaFingerprint:fingerprint,root:el("document",{"document-id":"doc"},[p("p","Before"),table(caption),p("q","After")])});
const caret=(block:string,offset:number):RichView["selection"]=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
const cells=["r1","r2"].flatMap(r=>columns.map(c=>{const base={table:"t",row:r,column:c.id};return {base,master:base,rowSpan:1,columnSpan:1,sources:[base]};}));
function view(documentJson:string,selection:RichView["selection"],readOnly=false):RichView{
 return {format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson,readOnly,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[{id:"t",hidden:false,rows:["r1","r2"],columns,cells}]} as unknown as RichView;
}
const model=(selection:RichView["selection"],caption=true)=>presentationModel(view(json(caption),selection),"original");
const owner=(language:1|2|3|4,capable=language===4)=>({supportsStandardInlineControls:()=>true,caretFormats:()=>[],inlineFormatState:(kind:string)=>({format:"breditor/rich-inline-format-state",formatVersion:1,formatKind:kind,schema:{name:"breditor/rich-test",version:1,fingerprint},state:{kind:"unset"}}),richLanguageVersion:()=>language,supportsListNumbering:()=>language===4,supportsTextLanguage:()=>language===4,supportsImageLinks:()=>language===4,supportsDetails:()=>language===4,supportsTableCaptions:()=>capable,supportsPageBreaks:()=>capable,supportsBlockLayout:()=>language>=3,blockLayoutState:()=>({format:"breditor/rich-block-layout-state",formatVersion:1,schema:{name:"t",version:1,fingerprint},blocks:"0",alignment:{kind:"unavailable"},direction:{kind:"unavailable"},indent:{kind:"unavailable"},lineHeightPercent:{kind:"unavailable"}})}) as unknown as RichCoreEditor;
let next=0;
const context=(core:RichCoreEditor|undefined,selection:RichView["selection"],caption=true):ActionContext=>({core,model:model(selection,caption),allocate:kind=>`${kind}-${++next}`,stamp:()=>({replica:"1",counter:"1",lamport:"1"})});

describe("candidate rich V4 table caption rendering",()=>{
 it("renders an editable <caption> first, shown after the rows",()=>{
  const surface=document.createElement("div");surface.contentEditable="true";render(surface,model(caret("p",0)),{});
  const element=surface.querySelector<HTMLTableElement>("table[data-rich-table]")!;
  const caption=element.firstElementChild as HTMLElement;
  expect(caption.tagName).toBe("CAPTION");expect(element.caption).toBe(caption);
  expect(caption.dataset["richTableCaption"]).toBe("t");expect(caption.style.captionSide).toBe("bottom");
  expect(caption.innerHTML).toBe('<p data-rich-block="cap" data-rich-text="cap">Legend</p>');
  expect(element.rows).toHaveLength(2);
  // Editable text in the surface: no non-editable island around it (checked natively in Playwright).
  expect(caption.closest("[contenteditable=false]")).toBeNull();
  // No caption, no <caption>; an empty caption keeps a caret line.
  const plain=document.createElement("div");render(plain,model(caret("p",0),false),{});expect(plain.querySelector("caption")).toBeNull();
  const empty=JSON.parse(json()) as {root:{children:{children:{children:unknown[]}[]}[]}};empty.root.children[1]!.children[2]!.children=[];
  const blank=document.createElement("div");render(blank,presentationModel(view(JSON.stringify(empty),caret("p",0)),"original"),{});
  expect(blank.querySelector("caption p")!.innerHTML).toBe("<br>");
 });
 it("maps a native caret in the caption to the caption paragraph",()=>{
  const surface=document.createElement("div");surface.contentEditable="true";document.body.append(surface);
  const value=model(caret("p",0));render(surface,value,{});
  const text=surface.querySelector("caption p")!.firstChild!;
  document.getSelection()!.setBaseAndExtent(text,3,text,3);
  expect(readNative(surface,value)).toEqual(caret("cap",3));
  surface.remove();
 });
});

describe("candidate rich V4 table caption controls and editing",()=>{
 it("binds only to an explicit V4 owner and toggles add/remove for the selected table",()=>{
  const core=owner(4);
  expect(()=>tableCaptionToolbarControls(owner(3))).toThrow();
  expect(()=>tableCaptionToolbarControls(owner(4,false))).toThrow();
  const presentation=createStandardRichInlinePresentationV1(catalogJson);
  expect(createRichToolbarV4(core,presentation).map(c=>c.id)).toContain("table-caption");
  expect(createLayoutRichToolbarV3(owner(3),presentation).map(c=>c.id)).not.toContain("table-caption");
  const [control]=tableCaptionToolbarControls(core);
  // Outside any table the control is disabled.
  expect(control!.enabled(context(core,caret("p",1)))).toBe(false);
  expect(control!.read!(context(core,caret("p",1)))).toEqual({kind:"unavailable"});
  // A caret in a cell, a node or grid selection, or a caret in the caption all target the table.
  for(const selection of [caret("p-r1-a",1),caret("cap",2),{kind:"node",block:"tbl"},{kind:"grid",anchor:{table:"t",row:"r1",column:"a"},focus:{table:"t",row:"r2",column:"b"}}] as RichView["selection"][]){
   const c=context(core,selection);
   expect(control!.enabled(c)).toBe(true);
   expect(control!.read!(c)).toEqual({kind:"uniform",pressed:true});
   expect(control!.command(c)).toEqual({kind:"removeTableCaption",data:{table:"t"}});
  }
  const add=context(core,caret("p-r2-b",0),false);
  expect(control!.read!(add)).toEqual({kind:"uniform",pressed:false});
  expect(control!.command(add)).toEqual({kind:"addTableCaption",data:{table:"t",caption:expect.stringMatching(/^caption-/)}});
  expect(()=>control!.command(context(owner(4),caret("cap",0)))).toThrow(/different Rust owner/);
  const m=model(caret("cap",0));
  expect(isTableCaption(m,"cap")).toBe(true);expect(isTableCaption(m,"p")).toBe(false);
  expect(selectedTableCaption(m)).toBe("cap");
  expect(tableCaptionOf(m.nodes.get("tbl")!)?.properties["breditor/block-id"]).toBe("cap");
  expect(tableCaptionOf(model(caret("p",0),false).nodes.get("tbl")!)).toBeUndefined();
 });
 it("keeps the caption one paragraph: Enter breaks the line, boundaries never merge",()=>{
  const core=owner(4);
  expect(enter(context(core,caret("cap",3)))).toEqual({kind:"insertHardBreak"});
  expect(boundaryDelete(context(core,caret("cap",0)),true)).toBeNull();
  expect(boundaryDelete(context(core,caret("cap",6)),false)).toBeNull();
  // Backspace at the start of an empty caption removes it.
  const empty=JSON.parse(json()) as {root:{children:{children:{children:unknown[]}[]}[]}};empty.root.children[1]!.children[2]!.children=[];
  const blank:ActionContext={core,model:presentationModel(view(JSON.stringify(empty),caret("cap",0)),"original"),allocate:k=>k,stamp:()=>({replica:"1",counter:"1",lamport:"1"})};
  expect(boundaryDelete(blank,true)).toEqual({kind:"removeTableCaption",data:{table:"t"}});
  // Insertions from a caption land after the table; flow controls are unavailable there.
  expect(positionAfter(context(core,caret("cap",2)))).toEqual({parent:{kind:"document"},before:"q"});
  expect(structuralIntervalV2(model(caret("cap",1)))).toBeUndefined();
  const ids=(id:string)=>defaultToolbar.find(c=>c.id===id)!;
  const inCaption=context(core,caret("cap",1));
  expect(ids("heading").enabled(inCaption)).toBe(false);
  expect(ids("bullet").enabled(inCaption)).toBe(false);
  expect(ids("bold").enabled(inCaption)).toBe(true);
  // The caption moves with its table and never alone.
  const m=model(caret("p",0));
  expect(richHandleBlock(m,"cap")).toBe("tbl");
  expect(resolveRichBlockMove(m,"cap",{anchor:"q",side:"after"},"flow-v1")).toEqual({kind:"rejected",reason:"not_movable"});
  expect(resolveRichBlockMove(m,"tbl",{anchor:"q",side:"after"},"flow-v1")).toMatchObject({kind:"move",parent:null,before:null});
 });
});

describe("candidate rich V4 caption arrow boundaries",()=>{
 it("maps Left/Right at the four offset boundaries and leaves other keys native",()=>{
  const surface=document.createElement("div");document.body.append(surface);
  const at=(selection:RichView["selection"])=>{const value=model(selection);render(surface,value,{});return value;};
  const to=(block:string,offset:number,affinity="before")=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(offset),affinity},focus:{block,offset:String(offset),affinity}}});
  expect(captionArrowCommands(surface,at(caret("cap",0)),"ArrowLeft")).toEqual([to("p-r2-b",3)]);
  expect(captionArrowCommands(surface,at(caret("cap",6)),"ArrowRight")).toEqual([to("cap",6),{kind:"navigateFlow",data:{movement:"after"}}]);
  expect(captionArrowCommands(surface,at(caret("p-r2-b",3)),"ArrowRight")).toEqual([to("cap",0,"after")]);
  expect(captionArrowCommands(surface,at(caret("q",0)),"ArrowLeft")).toEqual([to("cap",6)]);
  // Interior offsets, other cells and blocks not next to a captioned table stay native.
  expect(captionArrowCommands(surface,at(caret("cap",3)),"ArrowLeft")).toBeNull();
  expect(captionArrowCommands(surface,at(caret("p-r2-a",3)),"ArrowRight")).toBeNull();
  expect(captionArrowCommands(surface,at(caret("p-r1-b",3)),"ArrowRight")).toBeNull();
  expect(captionArrowCommands(surface,at(caret("p",0)),"ArrowLeft")).toBeNull();
  expect(captionArrowCommands(surface,at({kind:"text",anchor:{block:"cap",offset:"0",affinity:"after"},focus:{block:"cap",offset:"2",affinity:"after"}}),"ArrowLeft")).toBeNull();
  // Without a caption nothing is intercepted.
  render(surface,model(caret("q",0),false),{});
  expect(captionArrowCommands(surface,model(caret("q",0),false),"ArrowLeft")).toBeNull();
  surface.remove();
 });
});

describe("explicit V4 Wasm factory boundary for table captions",()=>{
 function local(descriptor:Record<string,unknown>,capability:unknown="1"){
  const observation={revision:"1",blockLayoutStateJson:vi.fn(),free:vi.fn()};
  const editor={observe:()=>observation,blockLayoutVersion:()=>"1",listNumberingVersion:()=>"1",textLanguageVersion:()=>"1",imageLinkVersion:()=>"1",detailsVersion:()=>"1",mentionVersion:()=>"1",tableCaptionVersion:()=>capability,pageBreakVersion:()=>"1",execute:vi.fn(()=>({status:"content",takeObservation:()=>observation,free:vi.fn()})),free:vi.fn()};
  const raw={descriptorJson:()=>({status:"value",takeValue:()=>JSON.stringify({kind:"rich",abiVersion:1,schema:{name:"t",version:1},schemaFingerprint:fingerprint,...descriptor}),free:vi.fn()}),createEditor:()=>({status:"editor",takeEditor:()=>editor,free:vi.fn()}),free:vi.fn()};
  const factory=vi.fn(()=>({status:"profile",takeProfile:()=>raw,free:vi.fn()}));
  return {wasm:{BreditorRichProfile:{fromBootstrapJsonV4:factory,fromStandardBootstrapJsonV4:factory}} as unknown as RichWasmModule,raw,editor};
 }
 const v4={richLanguageVersion:4,taskStructureVersion:1,blockLayoutVersion:1,listNumberingVersion:1,textLanguageVersion:1,imageLinkVersion:1,detailsVersion:1,mentionVersion:1,tableCaptionVersion:1,pageBreakVersion:1};
 it("requires tableCaptionVersion 1 in the descriptor and on the owner",()=>{
  const a=local(v4),profile=compileStandardRichProfileV4(a.wasm,"bootstrap"),core=profile.createEditor("document");
  expect(core.supportsTableCaptions?.()).toBe(true);
  core.execute({kind:"addTableCaption",data:{table:"t",caption:"cap"}});
  expect(JSON.parse(a.editor.execute.mock.calls[0]![1] as string)).toEqual({kind:"addTableCaption",data:{table:"t",caption:"cap"}});
  for(const bad of [{...v4,tableCaptionVersion:undefined},{...v4,tableCaptionVersion:2}]){const b=local(bad);expect(()=>compileStandardRichProfileV4(b.wasm,"bootstrap")).toThrow("V4 profile");expect(b.raw.free).toHaveBeenCalledOnce();}
  for(const capability of ["0",null]){const c=local(v4,capability),pr=compileStandardRichProfileV4(c.wasm,"bootstrap");expect(()=>pr.createEditor("document")).toThrow("table caption");expect(c.editor.free).toHaveBeenCalledOnce();pr.dispose();}
 });
});
