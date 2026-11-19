import {afterEach,describe,expect,it,vi} from "vitest";
import {RichDomEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {mountRichSelectionToolbar,mountRichContextMenu} from "../../breditor-experimental-rich-content/src/context_ui.js";
import {defaultToolbar,type ToolbarControl} from "../../breditor-experimental-rich-content/src/actions.js";
import {createRichSlashCommands,filterRichSlashItems} from "../../breditor-experimental-rich-content/src/slash_command_items.js";
import {mountRichSlashCommands} from "../../breditor-experimental-rich-content/src/slash_command_session.js";
import {mountRichTableColumnResize,type RichTableColumnResizeHost} from "../../breditor-experimental-rich-content/src/table_column_resize.js";
import {resolveRichUi,richUiStringsEn,defaultRichUi,type RichUiOptions} from "../../breditor-experimental-rich-content/src/ui_locale.js";
import type {RichCoreEditor,RichView,RichSelection,RichCommand} from "../../breditor-experimental-rich-content/src/core.js";
import {SharedDomEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import {mountSharedBlockDrag} from "../../breditor-collaboration/src/block_drag.js";
import type {SharedToolbarControl} from "../../breditor-collaboration/src/actions.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
import {arabicUi,arabicStrings} from "./ui_locale_ar.js";

const point=(block:string,offset:string)=>({block,offset,affinity:"after" as const});
const range:RichSelection={kind:"text",anchor:point("a","0"),focus:point("a","3")};
const element=(type:string,block:string,children:unknown[]=[],extra:Record<string,unknown>={})=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block,...extra},children});
const text=(value:string)=>({kind:"text",text:value,formats:[]});
/** "a" has no block direction; "r" is an explicit right-to-left block with mixed Arabic/Latin text. */
const documentJson=JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/ui-locale",version:1},schemaFingerprint:"fixture",root:element("document","root",[element("paragraph","a",[text("seed")]),element("paragraph","r",[text("مرحبا Breditor ١٢٣")],{"breditor/block-direction":2})])});
type Spec={id:string;label:string;fields?:{id:string;label:string;type:"text"}[]};
const specs:Spec[]=[{id:"undo",label:"Undo"},{id:"bold",label:"Bold"},{id:"italic",label:"Italic"},{id:"link",label:"Link",fields:[{id:"href",label:"Link URL",type:"text"}]},{id:"table",label:"Insert table"}];

function local(ui?:RichUiOptions,extra:{readOnly?:boolean}={}){
 let revision=1,selection:RichSelection|null=range,readOnly=extra.readOnly===true;
 const view=()=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson,selection,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[],...(readOnly?{readOnly:true,readOnlyRevision:String(revision)}:{})} as RichView);
 const core={view,supportsReadOnly:()=>true,setReadOnly:(value:boolean)=>{readOnly=value;revision++;return true;},execute:vi.fn((command:RichCommand)=>{if(command.kind==="setSelection"){selection=command.selection;revision++;return "selection";}revision++;return "content";}),dispose:vi.fn()} as unknown as RichCoreEditor;
 const toolbar=specs.map(spec=>({id:spec.id,label:spec.label,...(spec.fields?{fields:spec.fields}:{}),read:()=>({kind:"unset" as const}),enabled:()=>true,command:()=>({kind:"contextTest"}) as unknown as RichCommand}) satisfies ToolbarControl);
 const host=document.createElement("div");document.body.append(host);
 const dom=new RichDomEditor(host,{core,toolbar,...(ui?{ui}:{})});
 return {dom,host};
}
function shared(ui?:RichUiOptions,toolbar?:SharedToolbarControl[]){
 let revision=1,selection:RichSelection|null=range,readOnly=false;
 const view=()=>({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),documentJson,selection,pendingFormatsJson:null,undoDepth:2,redoDepth:0,historyCapacity:100,grid:null,tables:[],...(readOnly?{readOnly:true,readOnlyRevision:String(revision)}:{})});
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>{const frozen=JSON.stringify(view());return {view_json:()=>frozen,free:()=>{}};},free:vi.fn(),
  read_only_version:()=>"1",set_read_only:(_o:unknown,value:boolean)=>{readOnly=value;revision++;return true;},
  set_selection:(_o:unknown,json:string)=>{selection=JSON.parse(json);revision++;return true;},
  dispatch:vi.fn(()=>{revision++;return true;})};
 const core=new SharedRichEditor(raw as unknown as SharedRustOwner);
 const controls=toolbar??specs.map(spec=>({id:spec.id,label:spec.label,...(spec.fields?{fields:spec.fields}:{}),read:()=>({kind:"unset" as const}),enabled:()=>true,run:()=>{}}) as unknown as SharedToolbarControl);
 const host=document.createElement("div");document.body.append(host);
 const dom=new SharedDomEditor(host,{core,toolbar:controls,coreOwnership:"borrow",...(ui?{ui}:{})} as never);
 return {dom,host,core};
}
const action=(root:HTMLElement,id:string)=>root.querySelector<HTMLButtonElement>(`[data-rich-action="${id}"],[data-shared-action="${id}"]`)!;
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();});

describe("UI catalog validation",()=>{
 it("defaults to the frozen English catalog with no chrome direction or language",()=>{
  expect(resolveRichUi()).toBe(defaultRichUi);expect(defaultRichUi.strings).toEqual(richUiStringsEn);
  expect(defaultRichUi.direction).toBeNull();expect(defaultRichUi.lang).toBeNull();
  expect(defaultRichUi.text("richStatusReadOnlyOutcome",{outcome:"content",revision:"7"})).toBe("Read-only · content · revision 7");
  const node=document.createElement("div");defaultRichUi.applyChrome(node);expect(node.hasAttribute("dir")||node.hasAttribute("lang")).toBe(false);
 });
 it("rejects unknown keys, empty or oversized strings, foreign placeholders and plural syntax",()=>{
  expect(()=>resolveRichUi({strings:{nope:"x"}} as never)).toThrow("Unknown UI string key");
  expect(()=>resolveRichUi({colour:"red"} as never)).toThrow("Unknown UI option key");
  expect(()=>resolveRichUi({strings:{slashEmpty:"  "}})).toThrow("nonempty");
  expect(()=>resolveRichUi({strings:{slashEmpty:"x".repeat(513)}})).toThrow("at most 512");
  expect(()=>resolveRichUi({strings:{slashEmpty:"bad\u0007"}})).toThrow("control characters");
  expect(()=>resolveRichUi({strings:{slashCount:"{total} commands"}})).toThrow("unknown placeholder {total}");
  expect(()=>resolveRichUi({strings:{slashEmpty:"{count} none"}})).toThrow("unknown placeholder {count}");
  expect(()=>resolveRichUi({strings:{slashCount:"{count, plural, one {# command} other {# commands}}"}})).toThrow();
  expect(()=>resolveRichUi({strings:{slashCount:"{count} {"}})).toThrow("unmatched brace");
  expect(()=>resolveRichUi({direction:"up"} as never)).toThrow("ltr or rtl");
  expect(()=>resolveRichUi({lang:"not a tag"})).toThrow("BCP 47");
  expect(()=>resolveRichUi({slashItems:{"heading-9":{label:"x"}}} as never)).toThrow("Unknown standard slash-command item");
  expect(()=>resolveRichUi({controls:{bold:{label:"B",colour:"red"}}} as never)).toThrow("Unknown UI control");
  expect(()=>resolveRichUi({controls:{bold:{label:""}}})).toThrow("nonempty");
  expect(()=>resolveRichUi({strings:new Map() as never})).toThrow("plain object");
 });
 it("formats templates in one pass and keeps omitted placeholders out of the output",()=>{
  const ui=resolveRichUi({strings:{controlApply:"{label}: apply",slashCount:"Commands"}});
  expect(ui.text("controlApply",{label:"{label}"})).toBe("{label}: apply");expect(ui.text("slashCount",{count:4})).toBe("Commands");
  expect(Object.isFrozen(ui)).toBe(true);expect(Object.isFrozen(ui.strings)).toBe(true);
 });
 it("accepts the complete Arabic test catalog",()=>{
  const ui=resolveRichUi(arabicUi);expect(ui.direction).toBe("rtl");expect(ui.lang).toBe("ar");
  expect(ui.text("blockDragPosition",{index:2,count:5})).toBe("الموضع 2 من 5.");
  expect(Object.keys(arabicStrings).sort()).toEqual(Object.keys(richUiStringsEn).sort());
 });
});

describe("local and shared editor chrome",()=>{
 it("keeps English default chrome without dir or lang attributes",()=>{
  const {dom}=local(),toolbar=dom.toolbar;
  expect(dom.surface.getAttribute("aria-label")).toBe("Rich text editor");expect(toolbar.getAttribute("aria-label")).toBe("Rich text formatting");
  expect(action(toolbar,"link").textContent).toBe("Apply Link");expect(toolbar.querySelector("summary")!.getAttribute("aria-label")).toBe("Link formatting");
  for(const node of [toolbar,dom.status,dom.surface])expect(node.hasAttribute("dir")||node.hasAttribute("lang")).toBe(false);
  expect(dom.uiLocale()).toBe(defaultRichUi);
  const read=local(undefined,{readOnly:true});expect(read.dom.status.textContent).toBe("Read-only · revision 1");
 });
 it("localizes local chrome and mirrors only the chrome under an RTL UI",()=>{
  const {dom,host}=local(arabicUi),toolbar=dom.toolbar;
  expect(dom.surface.getAttribute("aria-label")).toBe("محرر النص المنسق");expect(toolbar.getAttribute("aria-label")).toBe("تنسيق النص");
  expect(toolbar.dir).toBe("rtl");expect(toolbar.lang).toBe("ar");expect(dom.status.dir).toBe("rtl");expect(dom.status.lang).toBe("ar");
  expect(action(toolbar,"bold").textContent).toBe("عريض");expect(action(toolbar,"link").textContent).toBe("تطبيق رابط");
  expect(toolbar.querySelector("summary")!.getAttribute("aria-label")).toBe("تنسيق رابط");
  expect(toolbar.querySelector<HTMLInputElement>('[data-rich-field="link-href"]')!.getAttribute("aria-label")).toBe("عنوان الرابط");
  // Content direction is never the chrome direction: the surface and root stay unset, blocks keep their own direction.
  expect(dom.surface.hasAttribute("dir")||dom.surface.hasAttribute("lang")).toBe(false);expect(host.hasAttribute("dir")).toBe(false);
  const block=(id:string)=>dom.surface.querySelector<HTMLElement>(`[data-rich-block="${id}"]`)!;
  expect(block("a").hasAttribute("dir")).toBe(false);expect(block("r").dir).toBe("rtl");expect(block("r").textContent).toBe("مرحبا Breditor ١٢٣");
  dom.setReadOnly(true);expect(dom.status.textContent).toBe(`للقراءة فقط · المراجعة ${dom.view().revision}`);
  dom.setReadOnly(false);expect(dom.status.textContent).toBe(`قابل للتحرير · المراجعة ${dom.view().revision}`);
  dom.execute({kind:"contextTest"} as unknown as RichCommand,false);expect(dom.status.textContent).toBe(`content · المراجعة ${dom.view().revision}`);
 });
 it("localizes shared chrome and its live status template",()=>{
  const english=shared();expect(english.dom.surface.getAttribute("aria-label")).toBe("Shared rich text editor");expect(english.dom.toolbar.getAttribute("aria-label")).toBe("Shared rich text controls");
  expect(english.dom.toolbar.hasAttribute("dir")).toBe(false);english.dom.dispose();
  const {dom}=shared(arabicUi);
  expect(dom.surface.getAttribute("aria-label")).toBe("محرر النص المشترك");expect(dom.toolbar.dir).toBe("rtl");expect(dom.toolbar.lang).toBe("ar");expect(dom.status.dir).toBe("rtl");
  expect(dom.surface.hasAttribute("dir")).toBe(false);expect(dom.surface.querySelector<HTMLElement>('[data-rich-block="r"]')!.dir).toBe("rtl");
  expect(action(dom.toolbar,"bold").textContent).toBe("عريض");expect(action(dom.toolbar,"link").textContent).toBe("تطبيق رابط");
  action(dom.toolbar,"bold").click();
  expect(dom.status.textContent).toMatch(/^المراجعة المشتركة \d+ · تراجع 2 · 0 بانتظار الاستلام$/);
  expect(dom.uiLocale().lang).toBe("ar");dom.dispose();
 });
 it("checks fields and options of admitted controls; entries for absent controls are inert",()=>{
  expect(()=>local({controls:{link:{fields:{url:{label:"x"}}}}})).toThrow('has no field "url"');
  expect(()=>local({controls:{link:{fields:{href:{options:{a:"x"}}}}}})).toThrow('has no option "a"');
  expect(()=>local({controls:{bold:{fields:{value:{label:"x"}}}}})).toThrow('has no field "value"');
  expect(()=>shared({controls:{link:{fields:{url:{label:"x"}}}}})).toThrow('has no field "url"');
  expect(()=>resolveRichUi({controls:{"bad id":{label:"x"}}})).toThrow("Expected a toolbar control id");
  expect(document.querySelector("[data-breditor-rich],[data-breditor-shared]")).toBeNull();
  // One catalog serves several toolbar profiles: "h1" is not admitted here and changes nothing.
  const {dom}=local({controls:{h1:{label:"عنوان 1"},bold:{label:"عريض"}}});
  expect(dom.contextControlIds()).not.toContain("h1");expect(action(dom.toolbar,"bold").textContent).toBe("عريض");
 });
 it("localizes select option labels by existing option value",()=>{
  const ui=resolveRichUi({controls:{dir:{label:"اتجاه النص",fields:{value:{label:"الاتجاه",options:{rtl:"من اليمين إلى اليسار"}}}}}});
  const control={id:"dir",label:"Text direction",fields:[{id:"value",label:"Text direction",type:"select" as const,options:[{value:"ltr",label:"Left to right"},{value:"rtl",label:"Right to left"}]}]};
  ui.checkControls([control]);const out=ui.control(control);
  expect(out.label).toBe("اتجاه النص");expect(out.fields[0]!.label).toBe("الاتجاه");expect(out.fields[0]!.options.map(o=>o.label)).toEqual(["Left to right","من اليمين إلى اليسار"]);
  expect(control.label).toBe("Text direction");
 });
});

describe("opt-in tools follow the editor catalog",()=>{
 for(const mode of ["local","shared"] as const){
  it(`${mode}: selection toolbar and context menu take labels, dir and lang from the editor`,()=>{
   const english=mode==="local"?local().dom:shared().dom,plain=mountRichSelectionToolbar(english),plainMenu=mountRichContextMenu(english);
   expect(plain.element.getAttribute("aria-label")).toBe("Selection formatting");expect(plainMenu.element.getAttribute("aria-label")).toBe("Editor actions");
   expect(plain.element.hasAttribute("dir")).toBe(false);plain.dispose();plainMenu.dispose();english.dispose();
   const dom=mode==="local"?local(arabicUi).dom:shared(arabicUi).dom,toolbar=mountRichSelectionToolbar(dom),menu=mountRichContextMenu(dom);
   expect(toolbar.element.getAttribute("aria-label")).toBe("تنسيق التحديد");expect(toolbar.element.dir).toBe("rtl");expect(toolbar.element.lang).toBe("ar");
   expect(menu.element.getAttribute("aria-label")).toBe("إجراءات المحرر");expect(menu.element.dir).toBe("rtl");
   expect(action(toolbar.element,"bold").textContent).toBe("عريض");
   toolbar.dispose();
   // The menu opens toward inline-start under RTL chrome: its right edge meets the pointer.
   Object.defineProperty(menu.element,"offsetWidth",{configurable:true,value:120});
   expect(menu.open({x:400,y:40})).toBe(true);expect(menu.element.style.left).toBe("280px");
   expect(action(menu.element,"undo").textContent).toBe("تراجع");menu.dispose();
  });
 }
 it("left-to-right chrome keeps the original menu placement",()=>{
  const {dom}=local(),menu=mountRichContextMenu(dom);Object.defineProperty(menu.element,"offsetWidth",{configurable:true,value:120});
  expect(menu.open({x:400,y:40})).toBe(true);expect(menu.element.style.left).toBe("400px");menu.dispose();
 });
 it("RTL selection toolbar roves with ArrowLeft as next",()=>{
  const {dom}=local(arabicUi),toolbar=mountRichSelectionToolbar(dom);dom.focus();
  const items=[...toolbar.element.querySelectorAll<HTMLElement>("button,summary")].filter(item=>!(item instanceof HTMLButtonElement&&item.closest("details")));
  items[0]!.focus();items[0]!.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true,cancelable:true}));
  expect(document.activeElement).toBe(items[1]);toolbar.dispose();
 });
 it("slash menu items, status and errors come from the catalog",()=>{
  const {dom}=local(arabicUi),slash=mountRichSlashCommands(dom,{items:createRichSlashCommands(defaultToolbar)});
  const menu=document.querySelector<HTMLElement>("[data-breditor-slash]")!;
  expect(menu.dir).toBe("rtl");expect(menu.lang).toBe("ar");expect(menu.querySelector("[role=listbox]")!.getAttribute("aria-label")).toBe("الأوامر");
  slash.dispose();
  const items=createRichSlashCommands(defaultToolbar,undefined,resolveRichUi(arabicUi));
  expect(items.map(item=>item.label)).toEqual(["نص","عنوان 1","عنوان 2","عنوان 3","قائمة نقطية","قائمة مرقمة","جدول"]);
  expect(filterRichSlashItems(items,"عنوان").map(item=>item.id)).toEqual(["heading-1","heading-2","heading-3"]);
  expect(filterRichSlashItems(items,"فقرة").map(item=>item.id)).toEqual(["paragraph"]);
  expect(createRichSlashCommands(defaultToolbar).map(item=>item.label)).toEqual(["Text","Heading 1","Heading 2","Heading 3","Bullet list","Numbered list","Table"]);
 });
 it("column separators announce through the host catalog and keep their explicit label override",()=>{
  const surface=document.createElement("div"),overlay=document.createElement("div");document.body.append(surface,overlay);
  const table=document.createElement("table");table.dataset["richTable"]="t";table.dataset["richBlock"]="tb";surface.append(table);
  table.getBoundingClientRect=()=>({left:0,right:300,top:0,bottom:40,width:300,height:40,x:0,y:0,toJSON(){return this;}}) as DOMRect;
  const host=(ui:RichUiOptions|undefined):RichTableColumnResizeHost=>({surface,writingState:()=>({revision:"1",closed:false,busy:false,composing:false,readOnly:false}),subscribeWriting:()=>()=>{},view:()=>({revision:"1",tables:[{id:"t",hidden:false,columns:[{id:"c1",width:100},{id:"c2",width:200}]}]}),...(ui?{uiLocale:()=>resolveRichUi(ui)}:{})}) as unknown as RichTableColumnResizeHost;
  let resize=mountRichTableColumnResize(overlay,host(undefined),{commit:()=>{}});
  let separators=[...overlay.querySelectorAll<HTMLElement>("[role=separator]")];
  expect(separators[0]!.getAttribute("aria-label")).toBe("Resize column 1 of 2");expect(separators[0]!.getAttribute("aria-valuetext")).toBe("100 pixels");
  expect(separators[0]!.hasAttribute("data-rtl")).toBe(false);resize.dispose();
  resize=mountRichTableColumnResize(overlay,host(arabicUi),{commit:()=>{}});separators=[...overlay.querySelectorAll<HTMLElement>("[role=separator]")];
  expect(separators[1]!.getAttribute("aria-label")).toBe("تغيير عرض العمود 2 من 2");expect(separators[1]!.getAttribute("aria-valuetext")).toBe("200 بكسل");
  expect(overlay.querySelector<HTMLElement>("[data-column-resize-badge]")!.dir).toBe("rtl");resize.dispose();
  resize=mountRichTableColumnResize(overlay,host(arabicUi),{commit:()=>{},label:index=>`Column ${index}`});
  expect(overlay.querySelector("[role=separator]")!.getAttribute("aria-label")).toBe("Column 0");resize.dispose();
 });
 it("RTL tables lay separators out from the right and ArrowLeft widens",()=>{
  const surface=document.createElement("div"),overlay=document.createElement("div");document.body.append(surface,overlay);
  const table=document.createElement("table");table.dataset["richTable"]="t";table.dataset["richBlock"]="tb";table.dir="rtl";surface.append(table);
  table.getBoundingClientRect=()=>({left:0,right:300,top:0,bottom:40,width:300,height:40,x:0,y:0,toJSON(){return this;}}) as DOMRect;
  const style=window.getComputedStyle;vi.spyOn(window,"getComputedStyle").mockImplementation(((node:Element)=>node===table?{direction:"rtl"} as CSSStyleDeclaration:style(node)) as typeof window.getComputedStyle);
  const commits:number[]=[];
  const host={surface,writingState:()=>({revision:"1",closed:false,busy:false,composing:false,readOnly:false}),subscribeWriting:()=>()=>{},view:()=>({revision:"1",tables:[{id:"t",hidden:false,columns:[{id:"c1",width:100},{id:"c2",width:200}]}]})} as unknown as RichTableColumnResizeHost;
  const resize=mountRichTableColumnResize(overlay,host,{commit:request=>{commits.push(request.width);}});
  const [first]=[...overlay.querySelectorAll<HTMLElement>("[role=separator]")];
  expect(first!.style.left).toBe("200px");expect(first!.dataset["rtl"]).toBe("true");
  first!.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true,cancelable:true}));
  first!.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true,cancelable:true}));
  expect(commits).toEqual([108,92]);resize.dispose();
 });
 it("block drag handle and announcements use the shared editor catalog",()=>{
  const {dom}=shared(arabicUi,[]),drag=mountSharedBlockDrag(dom);
  expect(drag.handle.getAttribute("aria-label")).toBe("نقل الكتلة");expect(drag.layer.dir).toBe("rtl");expect(drag.layer.lang).toBe("ar");
  const help=document.getElementById(drag.handle.getAttribute("aria-describedby")!)!;expect(help.textContent).toBe(arabicStrings.blockDragHelp);
  expect(drag.step("a",-1)).toBe(false);
  expect(drag.layer.querySelector("[role=status]")!.textContent).toBe("الكتلة عند حافة حاويتها بالفعل.");
  drag.dispose();dom.dispose();
  const english=shared(undefined,[]),plain=mountSharedBlockDrag(english.dom);
  expect(plain.handle.getAttribute("aria-label")).toBe("Move block");expect(plain.layer.hasAttribute("dir")).toBe(false);
  expect(plain.step("a",-1)).toBe(false);expect(plain.layer.querySelector("[role=status]")!.textContent).toBe("The block is already at the edge of its container.");
  plain.dispose();english.dom.dispose();
 });
});
