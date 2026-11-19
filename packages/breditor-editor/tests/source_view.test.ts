import {afterEach,describe,expect,it,vi} from "vitest";
import {mountDocumentRichEditor} from "../../breditor-experimental-rich-content/src/controller.js";
import {mountRichSourceView} from "../../breditor-experimental-rich-content/src/source_view.js";
import {RICH_DOCUMENT_SOURCE_MAX_BYTES} from "../../breditor-experimental-rich-content/src/source_view_types.js";
import {withoutTrailingEmptyParagraph} from "../../breditor-experimental-rich-content/src/source_view_host.js";
import {requireClipboardInterchange} from "../../breditor-experimental-rich-content/src/clipboard_interchange.js";
import type {RichDocumentCoreEditor,RichDocumentView,RichDocumentSelection,RichCommand} from "../../breditor-experimental-rich-content/src/core.js";
import {createRichInterchange} from "../../breditor-interchange/src/index.js";
// The real bounded interchange sanitizer runs over a stub native owner. Native admission, re-keying and
// exact Undo are stubbed here; experiments/rich-browser/source-view.spec.mjs proves them on release Wasm.
type Json={kind:string;type?:string;properties?:Record<string,unknown>;children?:Json[];text?:string;entityId?:unknown;formats?:unknown[]};
const schema={name:"test/source-view",version:1};
const seedRoot=():Json=>({kind:"element",type:"breditor/document",properties:{"breditor/document-id":"room"},children:[{kind:"element",type:"breditor/paragraph",properties:{"breditor/block-id":"a"},children:[{kind:"text",text:"Seed text",formats:[]}]}]});
function rekey(node:Json,prefix:string,counter:{n:number}):Json{const out:Json={...node};delete out.entityId;if(out.properties?.["breditor/block-id"]!==undefined)out.properties={...out.properties,"breditor/block-id":`${prefix}:${counter.n++}`};if(out.children)out.children=out.children.map(c=>rekey(c,prefix,counter));return out;}
function fixture({readOnly=false,adapter=true}={}){
 let revision=1,selection:RichDocumentSelection|null=null,policy=readOnly,root=seedRoot(),undo=0;
 const calls:{kind:string;data:Record<string,unknown>}[]=[],errors:unknown[]=[];
 const check=(expected?:string)=>{if(expected!==undefined&&expected!==String(revision))throw Error("stale native guard");};
 const documentJson=()=>JSON.stringify({schema,schemaFingerprint:"native fixture",root});
 const view=():RichDocumentView=>({format:"breditor/rich-document-view",formatVersion:1,revision:String(revision),documentJson:documentJson(),selection,pendingFormatsJson:null,undoDepth:undo,redoDepth:0,historyCapacity:100,tables:[],grid:null,...(policy?{readOnly:true}:{})});
 const transfer=(kind:"text"|"flow"|"grid",documentRoot:unknown)=>({format:"breditor/rich-clipboard-transfer" as const,formatVersion:1 as const,kind,structuredJson:JSON.stringify({kind,document:{root:documentRoot}}),plainText:""});
 const core={selectionPolicy:()=>"document-v1",view,documentJson,checkpointJson:()=>JSON.stringify(view()),supportsDocumentSelection:()=>true,supportsDocumentClipboard:()=>true,supportsDocumentNavigation:()=>true,supportsGeneralRanges:()=>true,supportsGeneralCopy:()=>true,supportsGeneralInlinePaste:()=>true,supportsGeneralFlowPaste:()=>true,supportsGeneralParagraph:()=>true,supportsReadOnly:()=>true,closeTypingGroup:()=>false,
  supportsClipboardInterchange:()=>true,
  admitClipboardRoot:vi.fn((kind:"text"|"flow"|"grid",rootJson:string)=>transfer(kind,JSON.parse(rootJson))),
  validateClipboard:(json:string)=>{const parsed=JSON.parse(json) as {kind:"text"|"flow"|"grid"};return{...transfer(parsed.kind,null),structuredJson:json};},
  setReadOnly:(value:boolean,expected?:string)=>{check(expected);policy=value;revision++;return true;},
  selectDocument:(expected?:string)=>{check(expected);selection={kind:"document"};revision++;return "selection" as const;},
  collapseDocumentSelection:(_side:string,expected?:string)=>{check(expected);selection=null;revision++;return "selection" as const;},
  copyDocument:()=>selection?.kind==="document"?transfer("flow",root):null,
  generalClipboard:()=>null,clipboard:()=>null,inlineFormatState:()=>{throw Error("Wrong read family");},
  replaceDocumentPlainText:(paragraph:string,text:string,expected?:string)=>{check(expected);if(policy)throw Error("native read-only");calls.push({kind:"plain",data:{paragraph,text}});root={...root,children:[{kind:"element",type:"breditor/paragraph",properties:{"breditor/block-id":paragraph},children:text?[{kind:"text",text,formats:[]}]:[]}]};undo++;revision++;return "content" as const;},
  replaceDocumentTypingText:()=>{throw Error("not used");},
  pasteDocumentClipboard:(clipboardJson:string,prefix:string,expected?:string)=>{check(expected);if(policy)throw Error("native read-only");calls.push({kind:"paste",data:{clipboardJson,prefix}});const parsed=JSON.parse(clipboardJson) as {document:{root:Json}};root=rekey(parsed.document.root,prefix,{n:0});root.properties={"breditor/document-id":"room"};selection=null;undo++;revision++;return "content" as const;},
  execute:vi.fn((command:RichCommand,expected?:string)=>{check(expected);if(command.kind==="undo"){undo--;revision++;root=seedRoot();return "undo";}if(command.kind==="setSelection"){selection=command.selection;revision++;return "selection";}throw Error("unexpected command");}),dispose:vi.fn()};
 const real=createRichInterchange(core),importHtml=vi.fn(real.importHtml),exportHtml=vi.fn(real.exportHtml);
 const interchange=adapter?requireClipboardInterchange({...real,importHtml,exportHtml},core):undefined;
 const host=document.createElement("div"),panelRoot=document.createElement("div");document.body.append(host,panelRoot);
 const dom=mountDocumentRichEditor(host,{core:core as unknown as RichDocumentCoreEditor,selectionEditing:"document-v1",toolbar:[],onError:e=>errors.push(e),...(interchange?{clipboardInterchange:interchange}:{})});
 return{core,dom,host,panelRoot,calls,errors,importHtml,exportHtml,root:()=>root,revision:()=>String(revision)};
}
const q=<T extends Element>(root:ParentNode,selector:string)=>root.querySelector<T>(selector)!;
const action=(root:ParentNode,name:string)=>q<HTMLButtonElement>(root,`[data-source-action=${name}]`);
const typeSource=(root:ParentNode,value:string)=>{const text=q<HTMLTextAreaElement>(root,"[data-source-text]");text.value=value;text.dispatchEvent(new Event("input",{bubbles:true}));};
afterEach(()=>{document.body.replaceChildren();vi.restoreAllMocks();});
describe("opt-in HTML source view (real interchange sanitizer, stubbed native owner)",()=>{
 it("exports the sanitized semantic HTML, reviews, and applies one whole-document paste",()=>{
  const t=fixture(),onApply=vi.fn(),view=mountRichSourceView(t.panelRoot,t.dom.documentSource(),{onApply});
  expect(q(t.panelRoot,"[data-source-text]").closest("div")!.hidden).toBe(true);
  action(t.panelRoot,"open").click();
  const text=q<HTMLTextAreaElement>(t.panelRoot,"[data-source-text]");
  expect(text.value).toBe(`<p style="white-space:pre-wrap">Seed text</p>`);expect(text.readOnly).toBe(false);expect(text.getAttribute("contenteditable")).toBeNull();
  expect(view.state()).toMatchObject({open:true,stale:false,revision:"2"});expect(document.activeElement).toBe(text);
  expect(action(t.panelRoot,"apply").disabled).toBe(true);
  typeSource(t.panelRoot,"<h2>Title</h2><p>New <strong>body</strong></p>");expect(t.calls).toEqual([]);
  action(t.panelRoot,"review").click();
  expect(q(t.panelRoot,"[data-source-report]").textContent).toContain("Nothing will be removed");expect(t.calls).toEqual([]);
  const undoBefore=t.core.view().undoDepth;
  action(t.panelRoot,"apply").click();
  expect(t.calls.map(c=>c.kind)).toEqual(["paste"]);expect(t.core.view().undoDepth).toBe(undoBefore+1);
  expect(onApply).toHaveBeenCalledWith("content");expect(view.state().open).toBe(false);
  expect(q(t.panelRoot,"[data-source-status]").textContent).toContain("Applied as one change");
  expect(t.host.querySelector("h2")?.textContent).toBe("Title");expect(t.host.querySelector("strong")?.textContent).toBe("body");
  t.dom.execute({kind:"undo"});expect(t.core.view().undoDepth).toBe(undoBefore);expect(t.host.textContent).toContain("Seed text");
  view.dispose();t.dom.dispose();
 });
 it("strips scripts, styles and event handlers and reports them before any mutation",()=>{
  const t=fixture(),view=mountRichSourceView(t.panelRoot,t.dom.documentSource());view.open();
  view.setSource(`<p onclick="alert(1)" class="x">Hi <img src=x onerror="alert(2)"></p><script>alert(3)</script><style>p{color:red}</style><iframe src="https://example.com"></iframe><p><a href="javascript:alert(4)">bad link</a></p>`);
  const preview=view.review()!;expect(preview.applicable).toBe(true);expect(t.calls).toEqual([]);
  const codes=preview.losses.map(n=>n.code);expect(codes).toEqual(expect.arrayContaining(["removed-content","unsupported-attribute","unsafe-link","image-reference"]));
  const items=[...t.panelRoot.querySelectorAll("[data-source-loss]")].map(n=>n.textContent);
  expect(items.join("\n")).toMatch(/Removed content \(scripts/);expect(items.join("\n")).toMatch(/Removed attributes \(event handlers/);expect(items.join("\n")).toMatch(/Unsafe links removed/);
  expect(t.panelRoot.querySelector("script,iframe,img,[data-source-report] style")).toBeNull();expect(t.panelRoot.querySelectorAll("style").length).toBe(1);
  view.apply();expect(t.calls.length).toBe(1);
  const stored=JSON.stringify(t.root());for(const forbidden of ["alert","onclick","onerror","script","javascript:","iframe","color:red"])expect(stored).not.toContain(forbidden);
  expect(t.dom.surface.querySelector("script,style,iframe,[onclick],[onerror]")).toBeNull();expect(t.host.textContent).toContain("bad link");
  view.dispose();t.dom.dispose();
 });
 it("does not keep full-page metadata or email layout attributes",()=>{
  const t=fixture(),view=mountRichSourceView(t.panelRoot,t.dom.documentSource());view.open();
  view.setSource(`<!doctype html><html><head><title>Page title</title><meta name="viewport" content="x"><base href="https://example.com/"><link rel="stylesheet" href="x.css"></head><body bgcolor="#eeeeee"><table width="600" bgcolor="#ffffff" align="center" cellpadding="0"><tr><td valign="top" style="padding:20px;font-family:Arial">Hello <b>reader</b></td></tr></table><!--[if mso]><p>Outlook only</p><![endif]--></body></html>`);
  const preview=view.review()!;expect(preview.applicable).toBe(true);
  // Page metadata is ignored without a notice; layout attributes and the stylesheet link are reported.
  expect(preview.losses.map(n=>n.code)).toEqual(expect.arrayContaining(["unsupported-attribute","unsupported-style"]));
  view.apply();const stored=JSON.stringify(t.root());
  for(const forbidden of ["Page title","viewport","example.com","x.css","bgcolor","#eeeeee","cellpadding","valign","padding","Outlook only"])expect(stored).not.toContain(forbidden);
  expect(stored).toContain("Hello ");expect(stored).toContain("reader");expect(stored).toContain(`"type":"breditor/table"`);
  view.dispose();t.dom.dispose();
 });
 it("refuses a stale apply with a clear message after the document changes",()=>{
  const t=fixture(),source=t.dom.documentSource(),view=mountRichSourceView(t.panelRoot,source);view.open();
  view.setSource("<p>Mine</p>");const preview=view.review()!;
  t.dom.replaceDocumentPlainText("Someone else");expect(t.calls.map(c=>c.kind)).toEqual(["plain"]);
  expect(view.state().stale).toBe(true);expect(action(t.panelRoot,"apply").disabled).toBe(true);expect(action(t.panelRoot,"review").disabled).toBe(true);expect(action(t.panelRoot,"reload").hidden).toBe(false);
  expect(q(t.panelRoot,"[data-source-status]").textContent).toMatch(/document changed after the source view opened \(revision 2, now 3\)\. Nothing was applied/);
  expect(()=>source.applyDocumentSource(preview)).toThrow(/changed after the source view opened.*Nothing was applied/);
  expect(()=>view.apply()).toThrow(/Nothing was applied/);expect(t.calls.map(c=>c.kind)).toEqual(["plain"]);
  action(t.panelRoot,"reload").click();expect(view.state()).toMatchObject({stale:false,revision:"3"});expect(q<HTMLTextAreaElement>(t.panelRoot,"[data-source-text]").value).toBe(`<p style="white-space:pre-wrap">Someone else</p>`);
  view.dispose();t.dom.dispose();
 });
 it("gives read-only editors a read-only source view",()=>{
  const t=fixture({readOnly:true}),source=t.dom.documentSource(),view=mountRichSourceView(t.panelRoot,source);
  expect(action(t.panelRoot,"open").textContent).toBe("View HTML source");view.open();
  const text=q<HTMLTextAreaElement>(t.panelRoot,"[data-source-text]");expect(text.readOnly).toBe(true);expect(text.value).toBe(`<p style="white-space:pre-wrap">Seed text</p>`);
  expect(action(t.panelRoot,"review").hidden).toBe(true);expect(action(t.panelRoot,"apply").hidden).toBe(true);expect(action(t.panelRoot,"cancel").textContent).toBe("Close");
  expect(q(t.panelRoot,"[data-source-status]").textContent).toMatch(/Read-only document/);
  expect(()=>view.setSource("<p>x</p>")).toThrow(/read-only/);
  const read=source.readDocumentSource();expect(()=>source.previewDocumentSource("<p>x</p>",read)).toThrow(/read-only; its source can be viewed but not applied/);
  expect(t.importHtml).not.toHaveBeenCalled();expect(t.calls).toEqual([]);
  view.dispose();t.dom.dispose();
 });
 it("bounds source size with the interchange limit before parsing",()=>{
  const t=fixture(),view=mountRichSourceView(t.panelRoot,t.dom.documentSource());view.open();
  view.setSource(`<p>${"日".repeat(Math.ceil(RICH_DOCUMENT_SOURCE_MAX_BYTES/3))}</p>`);
  expect(q(t.panelRoot,"[data-source-size]").hasAttribute("data-over")).toBe(true);
  expect(view.review()).toBeNull();expect(t.importHtml).not.toHaveBeenCalled();
  expect(q(t.panelRoot,"[data-source-status]").textContent).toMatch(/Nothing can be applied: the source exceeds the interchange limits/);
  expect(action(t.panelRoot,"apply").disabled).toBe(true);expect(()=>view.apply()).toThrow(/Review the source/);expect(t.calls).toEqual([]);
  view.setSource("<div>".repeat(200)+"deep");expect(view.review()).toBeNull();expect(view.state().error).toMatch(/exceeds the interchange limits/);expect(t.calls).toEqual([]);
  view.dispose();t.dom.dispose();
 });
 it("treats unchanged source as a no-op and Cancel as a discard",()=>{
  const t=fixture(),view=mountRichSourceView(t.panelRoot,t.dom.documentSource());view.open();
  const preview=view.review()!;expect(preview.unchanged).toBe(true);expect(t.importHtml).not.toHaveBeenCalled();expect(view.apply()).toBe("unchanged");expect(t.calls).toEqual([]);
  view.open();view.setSource("<p>Discard me</p>");view.review();action(t.panelRoot,"cancel").click();
  expect(view.state()).toMatchObject({open:false,preview:null});expect(q<HTMLTextAreaElement>(t.panelRoot,"[data-source-text]").value).toBe("");expect(t.calls).toEqual([]);
  expect(document.activeElement).toBe(action(t.panelRoot,"open"));
  view.dispose();t.dom.dispose();
 });
 it("invalidates a review on edit and refuses foreign or reused previews",()=>{
  const t=fixture(),source=t.dom.documentSource(),view=mountRichSourceView(t.panelRoot,source);view.open();
  view.setSource("<p>One</p>");const preview=view.review()!;typeSource(t.panelRoot,"<p>One edited</p>");
  expect(action(t.panelRoot,"apply").disabled).toBe(true);expect(view.state().preview).toBeNull();expect(()=>view.apply()).toThrow(/Review the source/);
  expect(()=>source.applyDocumentSource({...preview})).toThrow(/Review the source with this editor/);
  expect(()=>t.dom.documentSource().applyDocumentSource(preview)).toThrow(/Review the source with this editor/);
  expect(source.applyDocumentSource(preview)).toBe("content");expect(()=>source.applyDocumentSource(preview)).toThrow(/Review the source with this editor/);
  expect(t.calls.length).toBe(1);
  view.dispose();t.dom.dispose();
 });
 it("drops only the one trailing empty paragraph that whole-document paste re-appends",()=>{
  expect(withoutTrailingEmptyParagraph(`<p>a</p><p style="white-space:pre-wrap"></p>\n`)).toBe("<p>a</p>");
  expect(withoutTrailingEmptyParagraph("<p>a</p><p></p><p><br></p>")).toBe("<p>a</p><p></p>");
  for(const kept of ["<p></p>","<p>a</p><pre></pre>","<p>a</p><p>b</p>","<p>a</p><p> x </p>"])expect(withoutTrailingEmptyParagraph(kept)).toBe(kept);
  const t=fixture(),view=mountRichSourceView(t.panelRoot,t.dom.documentSource());view.open();view.setSource("<p>One</p><p></p>");view.review();
  expect(t.importHtml).toHaveBeenCalledWith("<p>One</p>",{kind:"flow"});view.dispose();t.dom.dispose();
 });
 it("requires the explicit interchange adapter and a separate host",()=>{
  const t=fixture({adapter:false}),source=t.dom.documentSource();expect(source.sourceState().available).toBe(false);
  expect(()=>mountRichSourceView(t.panelRoot,source)).toThrow(/explicit clipboard interchange adapter/);expect(()=>source.readDocumentSource()).toThrow(/explicit clipboard interchange adapter/);
  t.dom.dispose();const u=fixture();expect(()=>mountRichSourceView(u.host,u.dom.documentSource())).toThrow(/separate host/);
  const view=mountRichSourceView(u.panelRoot,u.dom.documentSource());expect(()=>mountRichSourceView(u.panelRoot,u.dom.documentSource())).toThrow(/unused separate host/);
  u.dom.dispose();expect(q(u.panelRoot,"[data-source-status]").textContent).toBe("Editor closed");view.dispose();expect(u.panelRoot.childElementCount).toBe(0);
 });
});
