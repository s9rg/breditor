/**
 * Catalog contract for the opt-in panels, interchange notices and refusal messages: Arabic labels end to end,
 * chrome-only dir/lang, logical keyboard order under RTL, and the developer-versus-end-user message split.
 * English byte identity is pinned separately in ui_locale_panels_baseline.test.ts.
 */
import {afterEach,describe,expect,it,vi} from "vitest";
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {resolveRichUi,richUiStringsEn,richUiPanelStringsEn,richUiNoticeCodes,richUiError,defaultRichUi,type RichUiLocale,type RichUiStringKey} from "../../breditor-experimental-rich-content/src/ui_locale.js";
import {clipboardInterchangeStatus,clipboardInterchangeReport,clipboardProjectionText} from "../../breditor-experimental-rich-content/src/clipboard_interchange.js";
import {RichDomEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {mountRichSearchPanel} from "../../breditor-experimental-rich-content/src/search_panel.js";
import {mountRichWritingTools} from "../../breditor-experimental-rich-content/src/writing_tools_panel.js";
import {createRichFullscreen} from "../../breditor-experimental-rich-content/src/fullscreen_controller.js";
import {mountRichFullscreenControls} from "../../breditor-experimental-rich-content/src/fullscreen_controls.js";
import type {RichCoreEditor,RichView,RichSelection,RichCommand} from "../../breditor-experimental-rich-content/src/core.js";
import {SharedDomEditor} from "../../breditor-collaboration/src/controller.js";
import {SharedRichEditor} from "../../breditor-collaboration/src/core.js";
import type {SharedToolbarControl} from "../../breditor-collaboration/src/actions.js";
import type {SharedRustOwner} from "../../breditor-collaboration/src/types.js";
import {BreditorSearchPanel} from "../src/search_react.js";
import {BreditorWritingTools} from "../src/writing_tools_react.js";
import {BreditorSharedReviewPanel} from "../src/shared_review_react.js";
import {arabicUi,arabicStrings} from "./ui_locale_ar.js";
import {arabicPanelStrings} from "./ui_locale_ar_panels.js";
import {searchScenario,writingScenario,fullscreenScenario,reviewScenario,suggestionScenario,refusal,settle} from "./ui_locale_panel_fixtures.js";
(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();});
const arabic=resolveRichUi(arabicUi);
const strip=(html:string)=>html.replace(/<style>[\s\S]*?<\/style>/g,"").replace(/<pre>[\s\S]*?<\/pre>/g,"");
/** Every visible text and accessible name of a capture, without styles and raw JSON previews (host data). */
function visible(html:string):string{const node=document.createElement("div");node.innerHTML=strip(html);return [node.textContent??"",...[...node.querySelectorAll("[aria-label]")].map(e=>e.getAttribute("aria-label")),...[...node.querySelectorAll("option")].map(o=>o.textContent)].join("\n");}
/** English sentence fragments of the panel block that must not survive under the Arabic catalog. */
const englishFragments=[...new Set(Object.values(richUiPanelStringsEn).flatMap(text=>text.split(/\{[A-Za-z]+\}/)).map(part=>part.trim()).filter(part=>part.length>=8&&/[a-z]{3}/.test(part)))];

describe("panel catalog block",()=>{
 it("keeps every English panel default within its declared placeholders and accepts them as a catalog",()=>{
  const ui=resolveRichUi({strings:{...richUiPanelStringsEn}});
  for(const key of Object.keys(richUiPanelStringsEn) as RichUiStringKey[])expect(ui.strings[key]).toBe(richUiStringsEn[key]);
  expect(Object.keys(arabicPanelStrings).sort()).toEqual(Object.keys(richUiPanelStringsEn).sort());
  expect(Object.keys(arabicStrings).length).toBeGreaterThan(256);
 });
 it("validates notices by known code and refusals by stable code shape",()=>{
  expect(()=>resolveRichUi({notices:{"made-up":"x"}} as never)).toThrow("Unknown UI notice key");
  expect(()=>resolveRichUi({notices:{"unsafe-link":" "}})).toThrow("nonempty");
  expect(()=>resolveRichUi({refusals:{"Not A Code":"x"}})).toThrow("stable refusal code");
  expect(()=>resolveRichUi({refusals:{"breditor_rich.read_only":"bad\u0007"}})).toThrow("control characters");
  expect(()=>resolveRichUi({strings:{searchCount:"{total}"}})).toThrow("unknown placeholder {total}");
  expect(resolveRichUi({notices:{"unsafe-link":"Unsafe links removed"}}).notice("unsafe-link")).toBe("Unsafe links removed");
  expect(defaultRichUi.notice("unsafe-link")).toBe("unsafe-link");expect(arabic.notice("from-a-newer-adapter")).toBe("from-a-newer-adapter");
  expect(richUiNoticeCodes).toContain("markdown-feature");
 });
 it("keeps thrown errors English for developers while describe() gives end users catalog text",()=>{
  const tagged=richUiError("searchErrorBusy");
  expect(tagged).toBeInstanceOf(Error);expect(tagged.message).toBe("Search actions wait for the current editor operation or composition");
  expect(defaultRichUi.describe(tagged,"x")).toBe(tagged.message);expect(arabic.describe(tagged,"x")).toBe(arabicPanelStrings.searchErrorBusy);
  const code=refusal("breditor_rich.read_only");expect(defaultRichUi.describe(code,"x")).toBe("the rich editor request was rejected");expect(arabic.describe(code,"x")).toBe("المستند للقراءة فقط.");
  expect(arabic.describe(Error("breditor_rich.read_only"),"x")).toBe("المستند للقراءة فقط.");
  expect(arabic.describe(Error("plain developer text"),"x")).toBe("plain developer text");
  expect(arabic.describe("not an error","fallback")).toBe("fallback");expect(arabic.describe(undefined,"fallback")).toBe("fallback");
  expect(arabic.describe({get code(){throw Error("freed");}},"fallback")).toBe("fallback");
  // A locale or refusal from another copy of the module (for example a second bundle) is still recognized.
  const foreignError=Object.defineProperty(Error("Search controls are closed"),Symbol.for("breditor.richUiError"),{value:{key:"searchErrorClosed"}});
  expect(arabic.describe(foreignError,"x")).toBe(arabicPanelStrings.searchErrorClosed);
  const foreignLocale=Object.freeze({...arabic,[Symbol.for("breditor.richUiLocale")]:true});expect(resolveRichUi(foreignLocale as unknown as RichUiLocale)).toBe(foreignLocale);
 });
});

describe("clipboard interchange status lines",()=>{
 const report=(operation:"copy"|"cut"|"paste",destination?:boolean)=>clipboardInterchangeReport(operation,"3",[{kind:"html",losses:[{code:"unsafe-link",count:2,effect:"loss"},{code:"style-approximation",count:1,effect:"compatibility"}]},{kind:"markdown",losses:[{code:"markdown-feature",count:1,effect:"loss"}]}],destination?{format:"breditor/rich-clipboard-text-projection",formatVersion:1,target:"caption",text:"x",losses:["block-structure","inline-formatting"]}:undefined);
 it("keeps the original English line and stable codes by default",()=>{
  expect(clipboardInterchangeStatus(report("paste",true))).toBe("Pasted · html: unsafe-link ×2, style-approximation; markdown: markdown-feature; text into caption; formatting loss: block-structure, inline-formatting.");
  expect(clipboardInterchangeStatus(report("cut"))).toBe("Cut · html: unsafe-link ×2, style-approximation; markdown: markdown-feature.");
  expect(clipboardInterchangeStatus(report("copy"),defaultRichUi)).toBe("Copied · html: unsafe-link ×2, style-approximation; markdown: markdown-feature.");
  expect(clipboardInterchangeStatus(clipboardInterchangeReport("copy","3",[{kind:"html",losses:[]}]))).toBeNull();
  expect(defaultRichUi.text("pasteLoss",clipboardProjectionText({target:"code",losses:["table-geometry","embedded-content"]}))).toBe("Pasted text into code; formatting loss: table-geometry, embedded-content.");
 });
 it("maps notice codes and the line template through the catalog",()=>{
  expect(clipboardInterchangeStatus(report("paste",true),arabic)).toBe("لُصق · HTML: روابط غير آمنة ×2، أنماط تقريبية؛ ماركداون: ميزة ماركداون؛ نص في التعليق؛ فُقد التنسيق: بنية الكتل، التنسيق الداخلي.");
  expect(arabic.text("pasteLoss",clipboardProjectionText({target:"code",losses:["table-geometry"]},arabic))).toBe("لُصق النص في الشيفرة؛ فُقد التنسيق: شكل الجدول.");
 });
});

describe("Arabic panels",()=>{
 const scenarios={search:searchScenario,writing:writingScenario,fullscreen:fullscreenScenario,review:reviewScenario,suggestion:suggestionScenario};
 for(const [name,scenario] of Object.entries(scenarios))it(`${name}: every state is localized, with dir/lang on the panel chrome only`,async()=>{
  const captures=await scenario(arabic);expect(captures.length).toBeGreaterThan(5);
  for(const html of captures){
   const node=document.createElement("div");node.innerHTML=html;const root=node.firstElementChild?.tagName==="STYLE"?node.children[1]!:node.firstElementChild!;
   const chrome=node.querySelector<HTMLElement>("[data-breditor-search],[data-breditor-writing],[data-breditor-fullscreen-controls],[data-breditor-review],[data-breditor-suggestions]")!;
   expect(chrome.dir).toBe("rtl");expect(chrome.lang).toBe("ar");void root;
   const text=visible(html);for(const fragment of englishFragments)expect(text,`${name} still shows "${fragment}"`).not.toContain(fragment);
  }
 });
 it("search: localized labels, status composition and refusal codes",async()=>{
  const [first,,third,readOnly,,,,,busy,,refused,,,,closed]=(await searchScenario(arabic)).map(html=>{const node=document.createElement("div");node.innerHTML=html;return node;});
  const search=first!.querySelector("[data-breditor-search]")!;expect(search.getAttribute("aria-label")).toBe("بحث واستبدال");expect(search.getAttribute("role")).toBe("search");
  expect([...search.querySelectorAll("label")].map(label=>label.firstChild!.textContent||label.textContent)).toEqual(["بحث","تعبير نمطي","مطابقة حالة الأحرف","كلمات كاملة","التفاف","استبدال بـ","توسيع المجموعات"]);
  expect([...search.querySelectorAll("button")].map(button=>button.textContent)).toEqual(["السابق","التالي","استبدال","استبدال الكل","إغلاق"]);
  const status=(node:HTMLElement)=>node.querySelector("[data-search-status]")!.textContent;
  expect(status(first!)).toBe("النتائج: 3");expect(status(third!)).toBe("1 من 3");expect(status(readOnly!)).toBe("1 من 3 · للقراءة فقط");
  expect(status(busy!)).toBe(arabicPanelStrings.searchErrorBusy);expect(status(refused!)).toBe("نص البحث غير صالح.");expect(status(closed!)).toBe("المحرر مغلق");
 });
 it("writing tools: isolated heading labels, page and status text",async()=>{
  const captures=(await writingScenario(arabic)).map(html=>{const node=document.createElement("div");node.innerHTML=html;return node;});
  const outline=[...captures[0]!.querySelectorAll("[data-writing-outline] button")];
  expect(outline.map(button=>button.innerHTML)).toEqual(["ع1 <bdi>Introduction</bdi>","ع2 (عنوان فارغ)"]);
  expect([...captures[1]!.querySelectorAll("[data-writing-outline] button")].map(button=>button.innerHTML)).toEqual(["ع2 (العنوان أطول من حد العرض) …","ع3 <bdi>Long heading</bdi> …"]);
  expect(captures[0]!.querySelector("[data-writing-pages]")!.textContent).toBe("العناوين 1–2 من 4");
  expect(captures[0]!.querySelector("[data-writing-outline]")!.getAttribute("aria-label")).toBe("مخطط العناوين");
  expect(captures[2]!.querySelector("[data-writing-status]")!.textContent).toBe("المستند المعتمد · المراجعة 4 · للقراءة فقط");
  expect(captures[5]!.querySelector("[data-writing-status]")!.textContent).toBe(`الإحصاءات غير متاحة: ${arabicPanelStrings.writingErrorStale}`);
  expect(captures[8]!.querySelector("[data-writing-status]")!.textContent).toBe("الإحصاءات غير متاحة: تعذّرت قراءة إحصاءات الكتابة.");
  expect([...captures[0]!.querySelectorAll("dt")].map(term=>term.textContent)).toEqual(["مقاطع الكلمات","الأحرف (وحدات الكتابة)","قيم يونيكود","وحدات UTF-16","بايتات UTF-8","كتل النص"]);
 });
 it("fullscreen: button, status and controller refusals",async()=>{
  const captures=(await fullscreenScenario(arabic)).map(html=>{const node=document.createElement("div");node.innerHTML=html;return [node.querySelector("button")!.textContent,node.querySelector("[role=status]")!.textContent];});
  expect(captures[0]).toEqual(["ملء الشاشة","ملء الشاشة غير متاح"]);expect(captures[1]).toEqual(["ملء الشاشة",arabicPanelStrings.fullscreenErrorUnavailable]);
  expect(captures[2]).toEqual(["الخروج من ملء الشاشة","ملء الشاشة مفعّل"]);expect(captures[4]![1]).toBe("أنهِ الكتابة قبل ملء الشاشة");
  expect(captures[5]![1]).toBe(arabicPanelStrings.fullscreenErrorIdle);expect(captures[7]![1]).toBe("جلسة ملء شاشة أخرى نشطة");expect(captures[8]![1]).toBe(arabicPanelStrings.fullscreenErrorForeignExit);
 });
 it("review and versions: isolated names and comment text, mapped states and refusal codes",async()=>{
  const captures=(await reviewScenario(arabic)).map(html=>{const node=document.createElement("div");node.innerHTML=html;return node;});
  const first=captures[0]!;
  expect(first.querySelector("h2")!.textContent).toBe("المراجعة");
  expect([...first.querySelectorAll("article h3")].map(h=>h.textContent)).toEqual(["نقاش — مفتوح","نقاش — متعارض (مساهمات مخفية)","نقاش — محلول"]);
  expect(first.querySelectorAll("article > p")[1]!.textContent).toBe("روابط متزامنة: منفصل: حُذف الهدف؛ بانتظار تعديلات المستند؛ مرتبط بالهدف الأصلي؛ منفصل: انطوى النطاق");
  const lines=[...first.querySelectorAll("article section div p")].map(p=>p.innerHTML);
  expect(lines).toContain("الكاتب: <bdi>alice</bdi>");expect(lines).toContain("<bdi>alice</bdi>: <bdi>First comment</bdi>");expect(lines).toContain("<bdi>carol</bdi>: [مسحوب]");
  expect([...captures[6]!.querySelectorAll("article > section > div > p")].map(p=>p.innerHTML).slice(0,3)).toEqual(["الاقتباس الأصلي: <bdi>Quoted text</bdi>","الاقتباس الأصلي: (مؤشر — لا نص محدد)","نقاش المستند — لا اقتباس محدد"]);
  expect(captures[5]!.textContent).toContain(arabicPanelStrings.reviewErrorSelect);
  expect(captures[0]!.textContent).toContain("الإصدارات المشتركة: جاهز. في الانتظار: 1؛ إدخالات الفهرس المقبولة: 2. بانتظار قبول سجل المستند. الحزمة المحددة: محفوظة محليًا؛ قبلها الخادم عند 5.");
  expect(captures[12]!.querySelector("pre")!.textContent).toContain(arabicPanelStrings.versionRestoreNotice);
  expect(captures[14]!.textContent).toContain("الإصدار غير متاح.");expect(captures[17]!.textContent).toContain("تعذّر حفظ الإصدار.");
 });
 it("suggestions: standard actions, composed details and outcomes",async()=>{
  const captures=(await suggestionScenario(arabic)).map(html=>{const node=document.createElement("div");node.innerHTML=html;return node;});
  const first=captures[0]!;
  expect([...first.querySelectorAll("select")[0]!.options].map(option=>option.textContent)).toEqual(["استبدال النص المحدد","استبدال نص عبر البنى","تغيير تنسيق النص","تغيير العنوان","تحويل إلى قائمة","إلحاق صف بالجدول","إلحاق عمود بالجدول","تغيير وصف الصورة","تغيير تعليق الصورة"]);
  expect([...captures[4]!.querySelectorAll("select")[1]!.options].map(option=>option.textContent)).toEqual(["فقرة","عنوان 1","عنوان 2","عنوان 3","عنوان 4","عنوان 5","عنوان 6"]);
  const texts=(node:HTMLElement)=>[...node.querySelectorAll("section > p")].map(p=>p.textContent);
  expect(texts(first)).toContain("الاقتراحات: معلّق. منشورات في الانتظار: 2؛ قرارات في الانتظار: 1. بانتظار قبول سجل المستند. اقتراحات متعارضة: s-1، s-2. المراجعات: ready؛ استبدالات في الانتظار: 2. relay paused.");
  expect(texts(captures[12]!)).toContain("Fix typo — اقترحه alice. الحزمة والنية محفوظتان محليًا. النشر في الانتظار، لم يُقبل بعد. المطلوب: قبول؛ المحاولة مجدولة.");
  expect(texts(captures[28]!)).toContain("النتيجة النهائية للخادم: قبول بواسطة bob عند 8. الكاتب القابل writer-1. طلبك (رفض) لم يُعتمد. لم يُحفظ الإيصال النهائي محليًا بعد؛ قد يكون سجل المستند معلقًا. استُبدل بالخلف next-id؛ لم يُقبل الاقتراح القديم.");
  expect(texts(captures[39]!)).toContain("فشل الحفظ المحلي.");
 });
});

describe("RTL keyboard order",()=>{
 for(const ui of [defaultRichUi,arabic])it(`outline arrows follow document order (${ui.direction??"default"} chrome)`,async()=>{
  const surface=document.createElement("div"),root=document.createElement("div");document.body.append(surface,root);
  const outline=["One","Two","Three"].map((label,i)=>Object.freeze({block:`h${i}`,level:1,label,labelTruncated:false}));
  const host={surface,writingState:()=>({revision:"1",closed:false,busy:false,composing:false,available:true,readOnly:false}),subscribeWriting:()=>()=>{},
   readWritingTools:()=>Object.freeze({revision:"1",schema:Object.freeze({name:"f",version:1}),counts:Object.freeze({words:"1",graphemes:"1",unicodeScalars:"1",utf16Units:"1",utf8Bytes:"1",textBlocks:"1"}),outline:Object.freeze(outline)}),
   selectWritingHeading:vi.fn(async()=>{}),uiLocale:()=>ui};
  const panel=mountRichWritingTools(root,host as never);
  try{
   const buttons=[...root.querySelectorAll<HTMLButtonElement>("[data-writing-outline] button")],press=(key:string)=>{const event=new KeyboardEvent("keydown",{key,bubbles:true,cancelable:true});document.activeElement!.dispatchEvent(event);return event.defaultPrevented;};
   buttons[0]!.focus();expect(press("ArrowDown")).toBe(true);expect(document.activeElement).toBe(buttons[1]);
   press("ArrowDown");press("ArrowDown");expect(document.activeElement).toBe(buttons[2]);
   press("Home");expect(document.activeElement).toBe(buttons[0]);press("ArrowUp");expect(document.activeElement).toBe(buttons[0]);press("End");expect(document.activeElement).toBe(buttons[2]);
   // Horizontal arrows are left to the browser in both directions; they never reorder the logical list.
   expect(press("ArrowLeft")).toBe(false);expect(press("ArrowRight")).toBe(false);expect(document.activeElement).toBe(buttons[2]);
   expect(root.querySelector("[data-breditor-writing]")!.getAttribute("dir")).toBe(ui.direction);
  }finally{panel.dispose();}
 });
});

const point=(block:string,offset:string)=>({block,offset,affinity:"after" as const});
const range:RichSelection={kind:"text",anchor:point("a","0"),focus:point("a","3")};
const documentJson=JSON.stringify({format:"breditor/document",formatVersion:2,schema:{name:"test/ui-locale",version:1},schemaFingerprint:"fixture",root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/block-id":"root"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"a"},children:[{kind:"text",text:"seed",formats:[]}]}]}});
function local(ui?:RichUiLocale|typeof arabicUi,fail?:unknown){
 let revision=1;const view=()=>({format:"breditor/rich-view",formatVersion:1,revision:String(revision),documentJson,selection:range,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[]} as RichView);
 const core={view,supportsSearch:()=>true,supportsWritingTools:()=>true,writingTools:()=>{throw refusal("breditor_rich.writing_tools_read");},execute:vi.fn((command:RichCommand)=>{if(fail!==undefined&&command.kind!=="setSelection")throw fail;revision++;return "content";}),dispose:vi.fn()} as unknown as RichCoreEditor;
 const host=document.createElement("div");document.body.append(host);
 return new RichDomEditor(host,{core,toolbar:[{id:"bold",label:"Bold",read:()=>({kind:"unset" as const}),enabled:()=>true,command:()=>({kind:"contextTest"}) as unknown as RichCommand}],...(ui?{ui:ui as never}:{})});
}
function shared(ui?:typeof arabicUi){
 let revision=1;const view=()=>({format:"breditor/shared-rich-view",formatVersion:1,revision:String(revision),documentJson,selection:range,pendingFormatsJson:null,undoDepth:0,redoDepth:0,historyCapacity:100,grid:null,tables:[]});
 const raw={descriptor_json:()=>JSON.stringify({format:"breditor/shared-rich-owner",abiVersion:1,modelVersion:11,journalVersion:12}),observe:()=>{const frozen=JSON.stringify(view());return {view_json:()=>frozen,free:()=>{}};},free:vi.fn(),
  read_only_version:()=>"1",set_read_only:()=>true,set_selection:()=>{revision++;return true;},dispatch:vi.fn(()=>{revision++;return true;})};
 const core=new SharedRichEditor(raw as unknown as SharedRustOwner);
 const controls=[{id:"bold",label:"Bold",read:()=>({kind:"unset" as const}),enabled:()=>true,run:()=>{throw refusal("permission_denied");}}] as unknown as SharedToolbarControl[];
 const host=document.createElement("div");document.body.append(host);
 return new SharedDomEditor(host,{core,toolbar:controls,coreOwnership:"borrow",...(ui?{ui}:{})} as never);
}
describe("editors hand their catalog to the panels and map refusal codes in status lines",()=>{
 it("local editor: panels read uiLocale(), and a native refusal shows the catalog message",async()=>{
  const english=local(undefined,refusal("breditor_rich.read_only"));
  english.toolbar.querySelector<HTMLButtonElement>('[data-rich-action="bold"]')!.click();expect(english.status.textContent).toBe("the rich editor request was rejected");english.dispose();
  const dom=local(arabicUi,refusal("breditor_rich.read_only"));
  expect(()=>dom.execute({kind:"contextTest"} as unknown as RichCommand,false)).toThrow("the rich editor request was rejected");
  dom.toolbar.querySelector<HTMLButtonElement>('[data-rich-action="bold"]')!.click();expect(dom.status.textContent).toBe("المستند للقراءة فقط.");
  const searchRoot=document.createElement("div"),writingRoot=document.createElement("div");document.body.append(searchRoot,writingRoot);
  const search=mountRichSearchPanel(searchRoot,dom),writing=mountRichWritingTools(writingRoot,dom);
  expect(searchRoot.firstElementChild!.getAttribute("aria-label")).toBe("بحث واستبدال");expect(searchRoot.firstElementChild!.getAttribute("dir")).toBe("rtl");
  expect(writingRoot.querySelector("[data-writing-status]")!.textContent).toBe("الإحصاءات غير متاحة: تعذّرت قراءة إحصاءات الكتابة.");
  // The editing surface keeps no chrome direction; content direction stays with the blocks and host page.
  expect(dom.surface.hasAttribute("dir")||dom.surface.hasAttribute("lang")).toBe(false);
  search.dispose();writing.dispose();
  const target=dom.surface.parentElement!,controlsRoot=document.createElement("div");target.append(controlsRoot);
  const controller=createRichFullscreen(dom),controls=mountRichFullscreenControls(controlsRoot,controller);
  expect(controlsRoot.querySelector("button")!.textContent).toBe("ملء الشاشة");expect(controlsRoot.firstElementChild!.getAttribute("lang")).toBe("ar");
  controls.dispose();await controller.dispose();dom.dispose();
 });
 it("shared editor: the same refusal mapping and panel catalog",()=>{
  const english=shared();english.toolbar.querySelector<HTMLButtonElement>('[data-shared-action="bold"]')!.click();expect(english.status.textContent).toBe("the rich editor request was rejected");english.dispose();
  const dom=shared(arabicUi);dom.toolbar.querySelector<HTMLButtonElement>('[data-shared-action="bold"]')!.click();expect(dom.status.textContent).toBe("ليست لديك صلاحية.");
  expect(dom.uiLocale().notice("unsafe-link")).toBe("روابط غير آمنة");dom.dispose();
 });
});

describe("React panel start failures",()=>{
 async function render(element:ReturnType<typeof createElement>){const host=document.createElement("div");document.body.append(host);const root=createRoot(host);await act(async()=>{root.render(element);});await act(async()=>{await settle();});return {host,root};}
 const closedSearch=(ui?:RichUiLocale)=>({surface:document.createElement("div"),searchState:()=>({revision:"1",closed:true,busy:false,composing:false,available:false,readOnly:false,canReplace:false}),subscribeSearch:()=>()=>{},findText:()=>{throw Error("x");},checkSearchResults:()=>{},selectSearchMatch:async()=>{},replaceSearchOne:async()=>{},replaceSearchAll:async()=>{},focus:()=>{},...(ui?{uiLocale:()=>ui}:{})});
 it("keeps the English alert without dir/lang and localizes it under a catalog",async()=>{
  const english=await render(createElement(BreditorSearchPanel,{editor:closedSearch() as never}));
  const alert=english.host.querySelector("[role=alert]")!;expect(alert.textContent).toBe("Search controls could not start: Use an open editor with complete native search capabilities");
  expect(alert.hasAttribute("dir")||alert.hasAttribute("lang")).toBe(false);await act(async()=>english.root.unmount());
  const localized=await render(createElement(BreditorSearchPanel,{editor:closedSearch(arabic) as never}));
  const arabicAlert=localized.host.querySelector("[role=alert]")!;
  expect(arabicAlert.textContent).toBe("تعذّر تشغيل أدوات البحث: Use an open editor with complete native search capabilities");expect(arabicAlert.getAttribute("dir")).toBe("rtl");expect(arabicAlert.getAttribute("lang")).toBe("ar");
  await act(async()=>localized.root.unmount());
  const writing=await render(createElement(BreditorWritingTools,{editor:{surface:document.createElement("div"),writingState:()=>({revision:"1",closed:true,busy:false,composing:false,available:false,readOnly:false}),subscribeWriting:()=>()=>{},readWritingTools:()=>{throw Error("x");},selectWritingHeading:async()=>{},uiLocale:()=>arabic} as never}));
  expect(writing.host.querySelector("[role=alert]")!.textContent).toMatch(/^تعذّر تشغيل أدوات الكتابة: /);await act(async()=>writing.root.unmount());
  const review=await render(createElement(BreditorSharedReviewPanel,{core:{reviewSnapshot:()=>{throw refusal("permission_denied");}} as never,initialOptions:{policy:()=>({principal:"a",access:"comment"}),ui:arabic}}));
  expect(review.host.querySelector("[role=alert]")!.textContent).toBe("تعذّر تشغيل أدوات المراجعة: ليست لديك صلاحية.");await act(async()=>review.root.unmount());
 });
});
