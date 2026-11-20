import {test,expect} from "@playwright/test";
import {fileURLToPath} from "node:url";
import {rolldown} from "rolldown";
// Opt-in AI rewrite review and language check over the actual Rust/Wasm owner with a fake in-page provider.
// No network: the provider is a page function controlled by the test. The interchange adapter is bundled for
// this test only (formatted provider output goes through it).
let interchange="";
test.beforeAll(async()=>{
 const bundle=await rolldown({input:fileURLToPath(new URL("../../packages/breditor-interchange/src/index.ts",import.meta.url)),platform:"browser",logLevel:"silent"});
 interchange=(await bundle.generate({format:"esm"})).output[0].code;await bundle.close();
});
async function mount(page,{general=false,typing=false}={}){
 await page.route("**/interchange.js",route=>route.fulfill({status:200,contentType:"text/javascript; charset=utf-8",body:interchange}));
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async({general,typing})=>{
  const api=await import("/rich.js"),{createRichInterchange}=await import("/interchange.js");
  const profile=api.compileStandardLayoutRichProfileV3(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema:{name:"example/ai-tools",version:3},extensions:[]}));
  const binding=profile.descriptor(),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:[{kind:"text",text,formats:[]}]});
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("a","Hello wrold, this is fine."),paragraph("b","Second paragraph.")]};
  const core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root}));
  if(typing)core.enableTypingHistory();
  const host=document.createElement("main"),aside=document.createElement("aside"),lang=document.createElement("aside"),errors=[];document.body.append(host,aside,lang);
  // A fixed sidebar: focusing its controls never scrolls the editor out of view (only visible rectangles are painted).
  lang.style.cssText="position:fixed;top:0;right:0;width:300px;max-height:100vh;overflow:auto;background:white";host.style.marginRight="320px";
  const editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,...(general?{rangeEditing:"general-v1"}:{}),onError:error=>errors.push(String(error))});
  const adapter=createRichInterchange(core);
  // Fake provider: records requests and answers when the test releases it.
  const requests=[],gates=[];
  const provider=request=>{requests.push({...request,signal:undefined});return new Promise((resolve,reject)=>{gates.push({resolve,reject,signal:request.signal});});};
  const tools=api.mountRichAiTools(aside,api.richAiToolsHost(editor),{provider,interchange:adapter,timeoutMs:0});
  let issues=[];
  const check=api.mountRichLanguageCheck(lang,api.richAiToolsHost(editor),{provider:request=>{requests.push({...request,signal:undefined});return Promise.resolve(issues);}});
  const select=(block,start,end=start,focus=true)=>editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}},focus);
  const texts=()=>Object.fromEntries(JSON.parse(core.documentJson()).root.children.map(n=>[n.properties["breditor/block-id"],n.children.map(c=>c.text??"").join("")]));
  window.ai={api,core,editor,tools,check,requests,gates,select,texts,errors,setIssues:value=>{issues=value;},undoDepth:()=>core.view().undoDepth,profile};
 },{general,typing});
}
const panel=page=>page.locator("[data-breditor-ai]");
const answer=(page,value)=>page.evaluate(value=>{const gate=window.ai.gates.at(-1);gate.resolve(value);},value);

test("rewrite review: scoped request, accessible diff, one guarded command and one-step Undo after typing",async({page})=>{
 await mount(page,{general:true,typing:true});
 // Ordinary typing first, so Undo must remove only the accepted suggestion.
 await page.evaluate(()=>window.ai.select("b",17));await page.keyboard.type(" Typed");
 expect((await page.evaluate(()=>window.ai.texts())).b).toBe("Second paragraph. Typed");
 await page.evaluate(()=>window.ai.select("a",6,11));
 const tools=panel(page);
 await tools.locator("[data-ai-field=instruction]").fill("Fix the spelling");
 await tools.getByRole("button",{name:"Suggest rewrite"}).click();
 await expect(tools).toHaveAttribute("aria-busy","true");await expect(tools.getByRole("button",{name:"Stop"})).toBeVisible();
 const request=await page.evaluate(()=>window.ai.requests[0]);
 expect(request).toMatchObject({kind:"rewrite",scope:"selection",instruction:"Fix the spelling",text:"wrold",segments:[{block:"a",start:6,end:11,text:"wrold"}]});
 expect(JSON.stringify(request)).not.toContain("Second");
 const before=await page.evaluate(()=>({texts:window.ai.texts(),undo:window.ai.undoDepth()}));
 await answer(page,{text:"world"});
 const review=tools.getByRole("region",{name:"Suggested change"});
 await expect(review).toBeVisible();await expect(review).toBeFocused();
 await expect(review.locator("[data-ai-before] del")).toHaveText("wrold");await expect(review.locator("[data-ai-after] ins")).toHaveText("world");
 expect(await page.evaluate(()=>window.ai.texts())).toEqual(before.texts);
 await review.getByRole("button",{name:"Accept"}).click();
 await expect(tools.locator("[data-ai-status]")).toContainText("Applied as one change");
 expect(await page.evaluate(()=>window.ai.texts())).toEqual({a:"Hello world, this is fine.",b:"Second paragraph. Typed"});
 expect(await page.evaluate(()=>window.ai.undoDepth())).toBe(before.undo+1);
 await expect(page.locator(".breditor-rich-surface")).toBeFocused();
 await page.keyboard.press("ControlOrMeta+z");
 expect(await page.evaluate(()=>window.ai.texts())).toEqual({a:"Hello wrold, this is fine.",b:"Second paragraph. Typed"});
 expect(await page.evaluate(()=>window.ai.errors)).toEqual([]);
});

test("stale results are refused: selection moves keep a review valid, content changes do not",async({page})=>{
 await mount(page);const tools=panel(page);
 await page.evaluate(()=>{window.ai.select("a",6,11);void window.ai.tools.requestRewrite({scope:"selection",instruction:"fix"});});
 await answer(page,{text:"world"});await expect(tools.getByRole("button",{name:"Accept"})).toBeVisible();
 // A caret move is a selection-only publication (new revision, identical content): still applicable.
 const moved=await page.evaluate(()=>{const r=window.ai.core.view().revision;window.ai.select("b",3);return [r,window.ai.core.view().revision];});
 expect(moved[0]).not.toBe(moved[1]);
 await tools.getByRole("button",{name:"Accept"}).click();
 expect((await page.evaluate(()=>window.ai.texts())).a).toBe("Hello world, this is fine.");
 // A content change while reviewing invalidates the snapshot: Accept is withdrawn and refused.
 await page.evaluate(()=>{window.ai.select("a",0,5);void window.ai.tools.requestRewrite({scope:"selection",instruction:"greet"});});
 await answer(page,{text:"Howdy"});await expect(tools.getByRole("button",{name:"Accept"})).toBeVisible();
 await page.evaluate(()=>window.ai.select("b",0));await page.keyboard.type("X");
 await expect(tools.locator("[data-ai-status]")).toHaveText(/The document changed after this suggestion was generated/);
 await expect(tools.getByRole("button",{name:"Accept"})).toBeHidden();
 const refused=await page.evaluate(()=>{const before=JSON.stringify(window.ai.texts());try{window.ai.tools.accept();return "applied";}catch(error){return [String(error.message),JSON.stringify(window.ai.texts())===before];}});
 expect(refused).toEqual([expect.stringContaining("document changed"),true]);
 expect(await page.evaluate(()=>window.ai.texts())).toEqual({a:"Hello world, this is fine.",b:"XSecond paragraph."});
 // Run again snapshots the current text.
 await page.evaluate(()=>window.ai.select("a",0,5));
 await tools.getByRole("button",{name:"Run again"}).click();
 expect(await page.evaluate(()=>window.ai.requests.at(-1).text)).toBe("Hello");
 await answer(page,{text:"Howdy"});await tools.getByRole("button",{name:"Accept"}).click();
 expect((await page.evaluate(()=>window.ai.texts())).a).toBe("Howdy world, this is fine.");
});

test("cancellation aborts the provider signal and changes nothing; Escape rejects a review",async({page})=>{
 await mount(page);const tools=panel(page);
 await page.evaluate(()=>window.ai.select("a",0,5));
 const before=await page.evaluate(()=>({texts:window.ai.texts(),revision:window.ai.core.view().revision}));
 await tools.locator("[data-ai-field=instruction]").fill("anything");await tools.getByRole("button",{name:"Suggest rewrite"}).click();
 await tools.getByRole("button",{name:"Stop"}).click();
 await expect(tools.locator("[data-ai-status]")).toHaveText("Request cancelled. The document was not changed.");
 expect(await page.evaluate(()=>window.ai.gates[0].signal.aborted)).toBe(true);
 await answer(page,{text:"LATE"});await expect(tools.locator("[data-ai-review]")).toBeHidden();
 expect(await page.evaluate(()=>({texts:window.ai.texts(),revision:window.ai.core.view().revision}))).toEqual(before);
 await tools.getByRole("button",{name:"Suggest rewrite"}).click();await answer(page,{text:"Bye"});
 const review=tools.getByRole("region",{name:"Suggested change"});await expect(review).toBeFocused();
 await page.keyboard.press("Escape");
 await expect(tools.locator("[data-ai-status]")).toHaveText("Suggestion discarded. The document was not changed.");
 expect(await page.evaluate(()=>window.ai.texts())).toEqual(before.texts);
});

test("untrusted formatted output is imported through the bounded adapter, sanitized and reported",async({page})=>{
 await mount(page,{general:true});const tools=panel(page);
 await page.evaluate(()=>{window.ai.select("a",6,11);void window.ai.tools.requestRewrite({scope:"selection",instruction:"format"});});
 await answer(page,{html:`<b onclick="window.pwned=1">bold</b> world<script>window.pwned=2</script><img src="x" onerror="window.pwned=3"><a href="javascript:window.pwned=4">link</a>`});
 await expect(tools.locator("[data-ai-loss-summary]")).toContainText("removed-content");
 for(const code of ["removed-content","unsupported-attribute","unsafe-link"])await expect(tools.locator(`[data-ai-loss="${code}"]`)).toHaveCount(1);
 expect(await tools.locator("script,img,b,a,[onclick],[onerror]").count()).toBe(0);
 const undo=await page.evaluate(()=>window.ai.undoDepth());
 await tools.getByRole("button",{name:"Accept"}).click();
 await expect(tools.locator("[data-ai-status]")).toContainText("Applied as one change");
 const after=await page.evaluate(()=>({doc:window.ai.core.documentJson(),texts:window.ai.texts(),undo:window.ai.undoDepth(),pwned:window.pwned}));
 expect(after.texts.a).toContain("bold world");expect(after.doc).toContain("breditor/strong");expect(after.undo).toBe(undo+1);
 for(const forbidden of ["pwned","onclick","onerror","javascript:","<script"])expect(after.doc).not.toContain(forbidden);
 expect(after.pwned).toBeUndefined();expect(await page.locator(".breditor-rich-surface").locator("script,img,[onclick]").count()).toBe(0);
 await page.evaluate(()=>window.ai.editor.execute({kind:"undo"}));
 expect((await page.evaluate(()=>window.ai.texts())).a).toBe("Hello wrold, this is fine.");
});

test("language check paints overlays without touching the editing DOM and applies by keyboard",async({page})=>{
 await mount(page);
 await page.evaluate(()=>window.ai.setIssues([
  {range:{block:"a",start:6,end:11},message:"Possible spelling mistake",suggestions:["world","wold"],kind:"spelling"},
  {range:{block:"a",start:13,end:17},message:"Weak word",suggestions:["it"]},
  {range:{block:"b",start:0,end:6},message:"Consider another word",suggestions:["Next"]},
  {range:{block:"b",start:3,end:99},message:"out of range",suggestions:[]},
 ]));
 const surface=page.locator(".breditor-rich-surface"),html=await surface.innerHTML(),lang=page.locator("[data-breditor-language]");
 await lang.getByRole("button",{name:"Check"}).click();
 await expect(lang.locator("[data-language-status]")).toContainText("3 issues");await expect(lang.locator("[data-language-status]")).toContainText("Malformed provider issues ignored: 1.");
 const overlay=page.locator("[data-language-overlay]");
 await expect(overlay.locator("[data-language-highlight]")).toHaveCount(3);
 const geometry=await page.evaluate(()=>{const s=document.querySelector(".breditor-rich-surface").getBoundingClientRect();return [...document.querySelectorAll("[data-language-highlight]")].map(m=>{const r=m.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=s.left-1&&r.right<=s.right+1&&r.top>=s.top-1&&r.bottom<=s.bottom+1;});});
 expect(geometry).toEqual([true,true,true]);
 expect(await surface.innerHTML()).toBe(html);expect(await page.evaluate(()=>document.querySelector(".breditor-rich-surface").contains(document.querySelector("[data-language-overlay]")))).toBe(false);
 const issues=lang.locator("[data-language-issue]");
 await issues.first().focus();await page.keyboard.press("ArrowDown");
 await expect(issues.nth(1)).toBeFocused();await expect(issues.nth(1)).toHaveAttribute("aria-current","true");
 await expect(overlay.locator("[data-language-active=true]")).toHaveCount(1);
 await page.keyboard.press("ArrowUp");await expect(issues.first()).toBeFocused();
 await page.keyboard.press("Enter");
 await expect(lang.getByRole("button",{name:"Replace with “world”"})).toBeFocused();
 const undo=await page.evaluate(()=>window.ai.undoDepth());
 await page.keyboard.press("Enter");
 expect(await page.evaluate(()=>window.ai.texts())).toEqual({a:"Hello world, this is fine.",b:"Second paragraph."});
 expect(await page.evaluate(()=>window.ai.undoDepth())).toBe(undo+1);
 await expect(lang.locator("[data-language-issue]")).toHaveCount(2);await expect(issues.first()).toBeFocused();
 // The later issue in the same block shifted exactly; its highlight still covers "this".
 expect(await page.evaluate(()=>window.ai.check.issues().map(i=>[i.block,i.start,i.end,i.text]))).toEqual([["a",13,17,"this"],["b",0,6,"Second"]]);
 await expect(overlay.locator("[data-language-highlight]")).toHaveCount(2);
 // Typing into block b drops only b's issue.
 await page.evaluate(()=>window.ai.select("b",17));await page.keyboard.type("!");
 await expect(lang.locator("[data-language-issue]")).toHaveCount(1);await expect(lang.locator("[data-language-status]")).toContainText("outdated issues removed: 1");
 await page.evaluate(()=>window.ai.editor.execute({kind:"undo"}));await page.evaluate(()=>window.ai.editor.execute({kind:"undo"}));
 expect((await page.evaluate(()=>window.ai.texts())).a).toBe("Hello wrold, this is fine.");
});
