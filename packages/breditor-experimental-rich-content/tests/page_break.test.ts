// @vitest-environment jsdom
import {describe,expect,it,vi} from "vitest";
import {render} from "../src/render.js";
import {presentationModel} from "../src/model.js";
import {pageBreakToolbarControls,pageBreakPosition,rootBlockOfSelection,pageBreakAttributes,richPageBreakStyles} from "../src/page_break.js";
import {richPrintStyles,resolveRichPrintLayout,richPrintPreviewStyles,mountRichPrintPreview} from "../src/print.js";
import {deleteSelection,boundaryDelete,type ActionContext} from "../src/actions.js";
import {createRichToolbarV4} from "../src/rich_toolbar_v4.js";
import {createLayoutRichToolbarV3} from "../src/layout_toolbar_v3.js";
import {createRichSlashCommands} from "../src/slash_command_items.js";
import {resolveRichBlockMove,isMovableBlock} from "../src/block_move.js";
import {selectedFlowAtom} from "../src/flow_controls.js";
import {resolveRichUi,richUiStringsEn} from "../src/ui_locale.js";
import {createStandardRichInlinePresentationV1} from "../src/standard_inline_v1.js";
import type {RichCoreEditor,RichView,RichWasmModule} from "../src/core.js";
import {compileStandardRichProfileV4} from "../index.js";
import {staticInlineCatalogV4} from "../../breditor-editor/src/static_document.js";
import {arabicUi} from "../../breditor-editor/tests/ui_locale_ar.js";

const fingerprint=`sha256:${"ef".repeat(32)}`;
const catalogJson=JSON.stringify({format:"breditor/inline-format-catalog",formatVersion:1,schema:{name:"breditor/rich-test",version:1,fingerprint},formats:[...staticInlineCatalogV4].sort((a,b)=>a.kind<b.kind?-1:1)});
const el=(type:string,properties:Record<string,unknown>,children:unknown[]=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:Object.fromEntries(Object.entries(properties).map(([k,v])=>[`breditor/${k}`,v])),children});
const run=(text:string)=>text?[{kind:"text",text,formats:[]}]:[];
const p=(id:string,text:string)=>el("paragraph",{"block-id":id},run(text));
const pb=(id:string)=>el("page-break",{"block-id":id});
const columns=[{id:"a",width:120}];
const cells=[{base:{table:"t",row:"r1",column:"a"},master:{table:"t",row:"r1",column:"a"},rowSpan:1,columnSpan:1,sources:[{table:"t",row:"r1",column:"a"}]}];
const table=el("table",{"block-id":"tbl","table-id":"t",columns,merges:[],"retracted-merges":[]},[el("table-row",{"block-id":"row-r1","row-id":"r1"},[el("table-cell",{"block-id":"cell","column-id":"a",header:false},[p("c","Cell")])])]);
/** `p`, page break `pb`, quote `bq` holding `r`, list `ul` holding `li` → `h`, table `tbl`, `q`. */
const json=()=>JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"breditor/rich-test",version:1},schemaFingerprint:fingerprint,root:el("document",{"document-id":"doc"},[
 p("p","Before"),pb("pb"),el("blockquote",{"block-id":"bq"},[p("r","Quote")]),el("bullet-list",{"block-id":"ul"},[el("list-item",{"block-id":"li"},[p("h","Item")])]),table,p("q","After"),
])});
type Selection=RichView["selection"];
const caret=(block:string,offset:number):Selection=>({kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}});
const node=(block:string):Selection=>({kind:"node",block}) as Selection;
function view(selection:Selection,readOnly=false):RichView{
 return {format:"breditor/rich-view",formatVersion:1,revision:"1",documentJson:json(),readOnly,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[{id:"t",hidden:false,rows:["r1"],columns,cells}]} as unknown as RichView;
}
const model=(selection:Selection,readOnly=false)=>presentationModel(view(selection,readOnly),"original");
const owner=(language:1|2|3|4,capable=language===4,atoms=false)=>({supportsStandardInlineControls:()=>true,caretFormats:()=>[],inlineFormatState:(kind:string)=>({format:"breditor/rich-inline-format-state",formatVersion:1,formatKind:kind,schema:{name:"breditor/rich-test",version:1,fingerprint},state:{kind:"unset"}}),richLanguageVersion:()=>language,supportsListNumbering:()=>language===4,supportsTextLanguage:()=>language===4,supportsImageLinks:()=>language===4,supportsDetails:()=>language===4,supportsTableCaptions:()=>language===4,supportsPageBreaks:()=>capable,supportsBookmarks:()=>language===4,supportsAtomEditing:()=>atoms,supportsBlockLayout:()=>language>=3,blockLayoutState:()=>({format:"breditor/rich-block-layout-state",formatVersion:1,schema:{name:"t",version:1,fingerprint},blocks:"0",alignment:{kind:"unavailable"},direction:{kind:"unavailable"},indent:{kind:"unavailable"},lineHeightPercent:{kind:"unavailable"}})}) as unknown as RichCoreEditor;
let next=0;
const context=(core:RichCoreEditor|undefined,selection:Selection,readOnly=false):ActionContext=>({core,model:model(selection,readOnly),allocate:kind=>`${kind}-${++next}`,stamp:()=>({replica:"1",counter:"1",lamport:"1"})});
const presentation=()=>createStandardRichInlinePresentationV1(catalogJson);

describe("candidate rich V4 page-break rendering",()=>{
 it("renders a non-editable, node-selectable separator labelled from the catalog",()=>{
  const surface=document.createElement("div");surface.contentEditable="true";render(surface,model(caret("p",0)),{});
  const marker=surface.querySelector<HTMLElement>("[data-rich-page-break]")!;
  expect(marker.tagName).toBe("DIV");
  expect(Object.fromEntries([...marker.attributes].map(a=>[a.name,a.value]))).toEqual({"data-rich-block":"pb","data-rich-page-break":"pb",class:"breditor-page-break",role:"separator","aria-label":"Page break",style:"break-after:page;page-break-after:always",contenteditable:"false","data-select-node":"pb"});
  expect(marker.childNodes).toHaveLength(0);
  expect(marker.previousElementSibling?.getAttribute("data-rich-block")).toBe("p");
  // A catalog relabels the marker; the default stays the English string.
  const arabic=document.createElement("div");render(arabic,model(caret("p",0)),{ui:arabicUi});
  expect(arabic.querySelector("[data-rich-page-break]")!.getAttribute("aria-label")).toBe("فاصل صفحة");
  expect(richUiStringsEn.pageBreakLabel).toBe("Page break");
  expect(pageBreakAttributes("X").map(a=>a.name)).toEqual(["class","role","aria-label","style"]);
  expect(richPageBreakStyles).toContain("content:attr(aria-label)");
 });
});

describe("candidate rich V4 page-break targeting and commands",()=>{
 it("inserts after the document-root block that holds the selection",()=>{
  const m=(s:Selection)=>pageBreakPosition(model(s));
  expect(m(caret("p",2))).toEqual({parent:{kind:"document"},before:"pb"});
  expect(m(caret("r",0))).toEqual({parent:{kind:"document"},before:"ul"});
  expect(m(caret("h",1))).toEqual({parent:{kind:"document"},before:"tbl"});
  expect(m(caret("c",0))).toEqual({parent:{kind:"document"},before:"q"});
  expect(m(caret("q",0))).toEqual({parent:{kind:"document"},before:null});
  expect(m(node("pb"))).toEqual({parent:{kind:"document"},before:"bq"});
  expect(rootBlockOfSelection(model(null))).toBeUndefined();
 });
 it("binds the Page break control to one V4 owner and refuses older owners",()=>{
  const core=owner(4),[control]=pageBreakToolbarControls(core);
  expect(control!.id).toBe("page-break");expect(control!.owner).toBe(core);
  expect(control!.enabled(context(core,caret("h",0)))).toBe(true);
  expect(control!.enabled(context(core,null))).toBe(false);
  expect(control!.command(context(core,caret("h",0)))).toEqual({kind:"insertPageBreak",data:{position:{parent:{kind:"document"},before:"tbl"},block:expect.stringMatching(/^page-break-\d+$/)}});
  expect(()=>control!.command(context(owner(4),caret("h",0)))).toThrow("different Rust owner");
  for(const old of [owner(3),owner(4,false)])expect(()=>pageBreakToolbarControls(old)).toThrow("V4 owner");
  expect(createRichToolbarV4(core,presentation()).some(c=>c.id==="page-break")).toBe(true);
  expect(createLayoutRichToolbarV3(owner(3),presentation()).some(c=>c.id==="page-break")).toBe(false);
 });
 it("offers the slash item only with the V4 toolbar",()=>{
  const v4=createRichSlashCommands(createRichToolbarV4(owner(4),presentation()));
  const item=v4.find(i=>i.id==="page-break")!;expect(item.label).toBe("Page break");
  expect(item.enabled(context(owner(4),caret("p",1)))).toBe(true);
  expect(item.enabled(context(owner(4),caret("p",1),true))).toBe(false);
  expect(createRichSlashCommands(createLayoutRichToolbarV3(owner(3),presentation())).some(i=>i.id==="page-break")).toBe(false);
  const ui=resolveRichUi({slashItems:{"page-break":{label:"Seitenumbruch"}}});
  expect(createRichSlashCommands(createRichToolbarV4(owner(4),presentation()),undefined,ui).find(i=>i.id==="page-break")!.label).toBe("Seitenumbruch");
 });
 it("deletes a node-selected page break as an atom and is a flow-navigation atom",()=>{
  expect(selectedFlowAtom(model(node("pb")))).toBe(true);
  expect(deleteSelection(context(owner(4,true,true),node("pb")))).toEqual({kind:"deleteAtom",data:{paragraph:expect.any(String),movement:"after"}});
  expect(deleteSelection(context(owner(4,true,false),node("pb")))).toEqual({kind:"deletePageBreak",data:{block:"pb",paragraph:expect.any(String)}});
  // Delete at the end of the block before a page break selects it (a second Delete removes it).
  expect(boundaryDelete(context(owner(4),caret("p",6)),false)).toEqual({kind:"setSelection",selection:{kind:"node",block:"pb"}});
 });
 it("moves page breaks only within the document root",()=>{
  const m=model(caret("p",0));
  expect(isMovableBlock(m,"pb")).toBe(true);
  expect(resolveRichBlockMove(m,"pb",{anchor:"q",side:"after"},"flow-v1")).toEqual({kind:"move",parent:null,before:null,move:{block:"pb",parent:null,before:null}});
  expect(resolveRichBlockMove(m,"pb",{anchor:"r",side:"before"},"flow-v1")).toEqual({kind:"rejected",reason:"grammar"});
 });
});

describe("opt-in print presentation",()=>{
 it("resolves bounded page layouts exactly and rejects everything else",()=>{
  expect(resolveRichPrintLayout()).toEqual({size:"A4",orientation:"portrait",margin:"normal",pageWidthMm:210,pageHeightMm:297,marginMm:25.4,contentWidthMm:159.2,contentHeightMm:246.2});
  expect(resolveRichPrintLayout({size:"Letter",orientation:"landscape",margin:"narrow"})).toEqual({size:"Letter",orientation:"landscape",margin:"narrow",pageWidthMm:279.4,pageHeightMm:215.9,marginMm:12.7,contentWidthMm:254,contentHeightMm:190.5});
  expect(resolveRichPrintLayout({margin:"wide"}).contentWidthMm).toBe(133.8);
  for(const bad of [{size:"A3"},{orientation:"up"},{margin:"1in"},{gutter:1},null,[]])expect(()=>resolveRichPrintLayout(bad as never)).toThrow(TypeError);
 });
 it("emits deterministic @page, forced-break and keep-together rules",()=>{
  const css=richPrintStyles({size:"Letter",orientation:"landscape",margin:"wide"});
  expect(css).toBe(richPrintStyles({size:"Letter",orientation:"landscape",margin:"wide"}));
  expect(css.startsWith("@page{size:Letter landscape;margin:38.1mm}@media print{")).toBe(true);
  for(const fragment of [
   "[data-breditor-rich] .breditor-page-break{display:block!important;height:0!important;margin:0!important;padding:0!important;border:0!important;break-after:page;page-break-after:always}",
   "[data-breditor-rich] tr,[data-breditor-rich] table>caption,[data-breditor-rich] figure{break-inside:avoid;page-break-inside:avoid}",
   "[data-breditor-rich] thead{display:table-header-group}",
   "[data-breditor-rich] h1,[data-breditor-rich] h2,[data-breditor-rich] h3,[data-breditor-rich] h4,[data-breditor-rich] h5,[data-breditor-rich] h6{break-after:avoid;page-break-after:avoid;break-inside:avoid;page-break-inside:avoid}",
   "[data-breditor-rich] .breditor-rich-toolbar,",
  ])expect(css).toContain(fragment);
  expect(richPrintStyles()).toContain("@page{size:A4 portrait;margin:25.4mm}");
  expect(richPrintPreviewStyles()).toContain("width:159.2mm!important");
  expect(richPrintPreviewStyles()).toContain("background-size:100% 246.2mm!important");
 });
 it("escapes bounded header text in the printed margin and emits native page counters",()=>{
  const options={runningHeader:'Release "A" \\ </style> 🙂',pageNumbers:true} as const;
  const printed=richPrintStyles(options);
  expect(printed).toContain('@top-center{content:"Release \\22 A\\22  \\5c  \\3c /style> 🙂";');
  expect(printed).toContain('@bottom-center{content:counter(page) " / " counter(pages);');
  expect(printed).not.toContain('</style>');
  expect(richPrintStyles(resolveRichPrintLayout(options))).toBe(printed);
  expect(richPrintStyles({runningHeader:"",pageNumbers:false})).toBe(richPrintStyles());
  for(const bad of [{runningHeader:"first\nsecond"},{runningHeader:"first\u0085second"},{runningHeader:"first\u2028second"},
   {runningHeader:"first\u2029second"},{runningHeader:"\ud800"},{runningHeader:"x".repeat(241)},{pageNumbers:"yes"}]){
   expect(()=>resolveRichPrintLayout(bad as never)).toThrow(TypeError);
  }
 });
 it("mounts, updates and disposes a print preview without touching content",()=>{
  const surface=document.createElement("div");surface.contentEditable="true";document.body.append(surface);render(surface,model(caret("p",0)),{});
  const before=surface.innerHTML;
  const preview=mountRichPrintPreview(surface,{size:"Letter"});
  expect(surface.hasAttribute("data-breditor-print-preview")).toBe(true);
  expect(surface.getAttribute("aria-description")).toBe("Print preview: page boundaries are approximate");
  expect(surface.dataset["breditorPrintSize"]).toBe("Letter");
  const style=document.head.querySelector<HTMLStyleElement>("style[data-breditor-print-preview]")!;
  expect(style.textContent).toContain('@media screen{[data-breditor-print-preview][data-breditor-print-size="Letter"][data-breditor-print-orientation="portrait"][data-breditor-print-margin="normal"]{');
  expect(style.textContent?.endsWith(richPrintStyles({size:"Letter"}))).toBe(true);
  expect(()=>mountRichPrintPreview(surface)).toThrow("already mounted");
  expect(preview.update({orientation:"landscape",runningHeader:"Changed title",pageNumbers:true}).pageWidthMm).toBe(297);
  expect(style.textContent).toContain("size:A4 landscape");expect(preview.layout.orientation).toBe("landscape");
  expect(style.textContent).toContain('@top-center{content:"Changed title";');
  expect(style.textContent).toContain('@bottom-center{content:counter(page) " / " counter(pages);');
  preview.update({orientation:"landscape"});
  expect(style.textContent).not.toMatch(/@top-center|@bottom-center/);
  expect(()=>preview.update({size:"B5"} as never)).toThrow(TypeError);
  expect(surface.innerHTML).toBe(before);
  preview.dispose();preview.dispose();
  expect(surface.hasAttribute("data-breditor-print-preview")||surface.hasAttribute("aria-description")||surface.hasAttribute("data-breditor-print-size")).toBe(false);
  expect(style.isConnected).toBe(false);
  const local=mountRichPrintPreview(surface,{ui:arabicUi,print:false});
  expect(surface.getAttribute("aria-description")).toBe("معاينة الطباعة: حدود الصفحات تقريبية");
  const screenOnly=document.head.querySelector("style[data-breditor-print-preview]")!.textContent;
  expect(screenOnly).toContain("@media screen{");
  expect(screenOnly).not.toContain("@page");
  local.dispose();surface.remove();
 });
 it("claims a surface before its attribute callback can mount another preview",()=>{
  let attempted=false,refusal="";
  const nested:ReturnType<typeof mountRichPrintPreview>[]=[];
  class PreviewSurface extends HTMLElement{
   static observedAttributes=["aria-description"];
   attributeChangedCallback(){
    if(attempted)return;
    attempted=true;
    try{nested.push(mountRichPrintPreview(this,{print:false}));}
    catch(error){refusal=String(error);}
   }
  }
  customElements.define("test-reentrant-print-preview",PreviewSurface);
  const surface=document.createElement("test-reentrant-print-preview");document.body.append(surface);
  const preview=mountRichPrintPreview(surface,{print:false});
  try{
   expect(refusal).toContain("already mounted");
   expect(nested).toHaveLength(0);
   expect(document.head.querySelectorAll("style[data-breditor-print-preview]")).toHaveLength(1);
  }finally{for(const nestedPreview of nested)nestedPreview.dispose();preview.dispose();surface.remove();}
  expect(document.head.querySelectorAll("style[data-breditor-print-preview]")).toHaveLength(0);
 });
});

describe("explicit V4 Wasm factory boundary for page breaks",()=>{
 function local(descriptor:Record<string,unknown>,capability:unknown="1"){
  const observation={revision:"1",blockLayoutStateJson:vi.fn(),free:vi.fn()};
  const editor={observe:()=>observation,blockLayoutVersion:()=>"1",listNumberingVersion:()=>"1",textLanguageVersion:()=>"1",imageLinkVersion:()=>"1",detailsVersion:()=>"1",mentionVersion:()=>"1",tableCaptionVersion:()=>"1",pageBreakVersion:()=>capability,bookmarkVersion:()=>"1",execute:vi.fn(()=>({status:"content",takeObservation:()=>observation,free:vi.fn()})),free:vi.fn()};
  const raw={descriptorJson:()=>({status:"value",takeValue:()=>JSON.stringify({kind:"rich",abiVersion:1,schema:{name:"t",version:1},schemaFingerprint:fingerprint,...descriptor}),free:vi.fn()}),createEditor:()=>({status:"editor",takeEditor:()=>editor,free:vi.fn()}),free:vi.fn()};
  const factory=vi.fn(()=>({status:"profile",takeProfile:()=>raw,free:vi.fn()}));
  return {wasm:{BreditorRichProfile:{fromBootstrapJsonV4:factory,fromStandardBootstrapJsonV4:factory}} as unknown as RichWasmModule,raw,editor};
 }
 const v4={richLanguageVersion:4,taskStructureVersion:1,blockLayoutVersion:1,listNumberingVersion:1,textLanguageVersion:1,imageLinkVersion:1,detailsVersion:1,mentionVersion:1,tableCaptionVersion:1,pageBreakVersion:1,bookmarkVersion:1};
 it("requires pageBreakVersion 1 in the descriptor and on the owner",()=>{
  const a=local(v4),profile=compileStandardRichProfileV4(a.wasm,"bootstrap"),core=profile.createEditor("document");
  expect(core.supportsPageBreaks?.()).toBe(true);
  const command={kind:"insertPageBreak",data:{position:{parent:{kind:"document"},before:null},block:"pb"}} as const;
  core.execute(command);
  expect(JSON.parse(a.editor.execute.mock.calls[0]![1] as string)).toEqual(command);
  for(const bad of [{...v4,pageBreakVersion:undefined},{...v4,pageBreakVersion:2}]){const b=local(bad);expect(()=>compileStandardRichProfileV4(b.wasm,"bootstrap")).toThrow("V4 profile");expect(b.raw.free).toHaveBeenCalledOnce();}
  for(const capability of ["0",null]){const c=local(v4,capability),pr=compileStandardRichProfileV4(c.wasm,"bootstrap");expect(()=>pr.createEditor("document")).toThrow("page break");expect(c.editor.free).toHaveBeenCalledOnce();pr.dispose();}
 });
});
