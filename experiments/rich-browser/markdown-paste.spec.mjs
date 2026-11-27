import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Opt-in automatic Markdown detection (markdownPaste: "detect") over the actual Rust/Wasm owner and the explicit
// interchange port. Chromium performs a real system-clipboard paste (Ctrl/Cmd+V); every engine also runs the
// dispatched-event contract. Undo, the post-paste notice and the plain-text escape are exercised end to end.
let interchange="";
test.beforeAll(async()=>{
 const bundle=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 interchange=(await bundle.generate({format:"esm"})).output[0].code;await bundle.close();
});
const MARKDOWN="## Release notes\n\n- First item\n- Second **bold** item";
test.beforeEach(async({page})=>{
 await page.route("**/interchange.js",route=>route.fulfill({status:200,contentType:"text/javascript; charset=utf-8",body:interchange}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js"),{createRichInterchange}=await import("/interchange.js");
  const bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/markdown-paste",version:4},extensions:[]});
  const paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:text?[{kind:"text",text,formats:[]}]:[]});
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,bootstrap),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson()),binding=profile.descriptor();
  const host=document.createElement("main"),errors=[],events=[];document.body.append(host);
  let core,editor;
  const mount=(options={})=>{
   editor?.dispose();host.replaceChildren();events.length=0;errors.length=0;
   core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("p","Intro")]}}));
   editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,clipboardInterchange:createRichInterchange(core),markdownPaste:"detect",markdownPasteNotice:true,onMarkdownPaste:event=>events.push(event),onError:error=>errors.push(String(error)),...options});
   editor.focus();editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:"5",affinity:"after"},focus:{block:"p",offset:"5",affinity:"after"}}});
   window.mp.core=core;window.mp.editor=editor;
  };
  const shape=node=>node.kind==="text"?node.text:{type:node.type.slice(9),children:node.children.map(shape)};
  const top=()=>JSON.parse(window.mp.core.documentJson()).root.children.map(shape);
  const dispatchPaste=values=>{const data=new DataTransfer();for(const [type,value] of Object.entries(values))data.setData(type,value);const event=new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:data});if(event.clipboardData!==data)for(const [type,value] of Object.entries(values))event.clipboardData.setData(type,value);window.mp.editor.surface.dispatchEvent(event);return event.defaultPrevented;};
  window.mp={mount,top,dispatchPaste,events,errors,core,editor,reports:()=>events.map(e=>({...e.report,signals:[...e.report.signals]}))};
  mount();
 });
});
const top=page=>page.evaluate(()=>window.mp.top());
const literalTop=[{type:"paragraph",children:["Intro## Release notes"]},{type:"paragraph",children:[]},{type:"paragraph",children:["- First item"]},{type:"paragraph",children:["- Second **bold** item"]}];
const expectConverted=async page=>{
 const blocks=await top(page);
 expect(blocks.map(block=>block.type)).toContain("heading");expect(blocks.map(block=>block.type)).toContain("bullet-list");
 expect(JSON.stringify(blocks)).toContain("Release notes");expect(JSON.stringify(blocks)).not.toContain("## ");expect(JSON.stringify(blocks)).not.toContain("**");
};

test("a real Ctrl/Cmd+V of Markdown converts as one Undo step, and the notice restores plain text",async({page,context,browserName})=>{
 test.skip(browserName!=="chromium","Playwright grants system clipboard access only in Chromium; other engines run the dispatched contract below");
 await context.grantPermissions(["clipboard-read","clipboard-write"]);
 const before=await top(page);
 await page.evaluate(text=>navigator.clipboard.writeText(text),MARKDOWN);
 await page.locator(".breditor-rich-surface").focus();
 await page.keyboard.press("ControlOrMeta+V");
 await expectConverted(page);
 expect(await page.evaluate(()=>window.mp.reports())).toEqual([expect.objectContaining({format:"breditor/markdown-paste-report",detector:"markdown-paste-detect-v1",signals:["heading","bullet-list","strong"]})]);
 const notice=page.locator(".breditor-markdown-paste-notice");
 await expect(notice).toBeVisible();await expect(notice).toHaveAttribute("role","status");
 await expect(notice.getByRole("button",{name:"Undo to plain text"})).toBeVisible();
 // One Undo removes the whole conversion; Redo brings it back exactly.
 const converted=await top(page);
 await page.keyboard.press("ControlOrMeta+z");expect(await top(page)).toEqual(before);await expect(notice).toBeHidden();
 await page.keyboard.press("ControlOrMeta+y");expect(await top(page)).toEqual(converted);
 // A fresh paste offers the notice again; its button swaps the conversion for the literal clipboard text.
 await page.keyboard.press("ControlOrMeta+z");
 await page.keyboard.press("ControlOrMeta+V");await expectConverted(page);
 await notice.getByRole("button",{name:"Undo to plain text"}).click();
 expect(await top(page)).toEqual(literalTop);await expect(notice).toBeHidden();
 await page.keyboard.press("ControlOrMeta+z");expect(await top(page)).toEqual(before);
 expect(await page.evaluate(()=>window.mp.errors)).toEqual([]);
});

test("Ctrl/Cmd+Shift+V pastes the system clipboard literally once",async({page,context,browserName})=>{
 test.skip(browserName!=="chromium","Playwright grants system clipboard access only in Chromium");
 await context.grantPermissions(["clipboard-read","clipboard-write"]);
 await page.evaluate(text=>navigator.clipboard.writeText(text),MARKDOWN);
 await page.locator(".breditor-rich-surface").focus();
 await page.keyboard.press("ControlOrMeta+Shift+V");
 await expect.poll(()=>top(page)).toEqual(literalTop);
 expect(await page.evaluate(()=>window.mp.events.length)).toBe(0);
 // The escape is one-shot: the next ordinary paste detects again.
 await page.keyboard.press("ControlOrMeta+z");await page.keyboard.press("ControlOrMeta+V");await expectConverted(page);
 expect(await page.evaluate(()=>window.mp.errors)).toEqual([]);
});

test("dispatched text/plain paste: detection, negatives, escape and opt-out",async({page})=>{
 const before=await top(page);
 expect(await page.evaluate(m=>window.mp.dispatchPaste({"text/plain":m}),MARKDOWN)).toBe(true);
 await expectConverted(page);
 await page.keyboard.press("ControlOrMeta+z");expect(await top(page)).toEqual(before);
 // Prose, a code snippet and a footnote stay literal.
 for(const text of ["We should ship on Friday.\nThe docs are ready.","const a = 1;\nfunction f() {\n  return a;\n}","Free shipping.*\n\n* Terms apply."]){
  await page.evaluate(()=>window.mp.mount());
  await page.evaluate(t=>window.mp.dispatchPaste({"text/plain":t}),text);
  expect((await top(page)).every(block=>block.type==="paragraph")).toBe(true);
 }
 expect(await page.evaluate(()=>window.mp.events.length)).toBe(0);
 // The keyboard escape arms one literal paste even for a dispatched event.
 await page.evaluate(()=>window.mp.mount());
 await page.evaluate(m=>{const surface=window.mp.editor.surface;surface.dispatchEvent(new KeyboardEvent("keydown",{key:"V",ctrlKey:true,shiftKey:true,bubbles:true}));window.mp.dispatchPaste({"text/html":"<b>ignored</b>","text/plain":m});},MARKDOWN);
 expect(await top(page)).toEqual(literalTop);
 // Without the option an ordinary text/plain paste is never guessed.
 await page.evaluate(()=>window.mp.mount({markdownPaste:"literal"}));
 await page.evaluate(m=>window.mp.dispatchPaste({"text/plain":m}),MARKDOWN);
 expect(await top(page)).toEqual(literalTop);
 expect(await page.evaluate(()=>window.mp.errors)).toEqual([]);
});
