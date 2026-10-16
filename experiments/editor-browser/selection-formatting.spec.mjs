import {test,expect} from "@playwright/test";
const ready=async(page,mode,extra="")=>{await page.goto(`/selection-formatting.html?mode=${mode}${extra}`);await expect(page.locator("#ready")).toHaveText("Ready");};
const document=page=>page.evaluate(()=>window.coverage.a.view().documentJson);
const select=async(page,kind)=>page.evaluate(kind=>{const t=window.coverage;t.select(kind==="grid"?t.grid():kind==="range"?t.range("z-intro",1,"q2",2):kind==="backward"?t.range("q2",2,"z-intro",1):{kind:"node",block:kind});},kind);
const bold=page=>page.locator('#a [role="toolbar"]').getByRole("button",{name:"Bold",exact:true}).click();
const history=(page,redo=false)=>page.evaluate(redo=>window.coverage.history(redo),redo);
const coverage=page=>page.evaluate(()=>window.coverage.core.selectionCoverage());
const clean=async page=>expect(await page.evaluate(()=>window.coverage.errors)).toEqual([]);
async function reload(page){const checkpoint=await page.evaluate(()=>window.coverage.save());await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(()=>window.coverage.a.checkpointJson())).toBe(checkpoint);}
// Check every character, including untouched base cells/captions and surrogate halves.
async function exactStrongCoverage(page,spans){
 expect(await page.evaluate(spans=>{
  const selected=new Map(spans.map(s=>[s.block,s])),failures=[];
  function walk(n){const id=n.properties?.["breditor/block-id"];let at=0;for(const c of n.children??[]){if(c.kind==="text"){const s=selected.get(id),strong=c.formats.some(f=>f.type==="breditor/strong");for(let i=0;i<c.text.length;i++){if(strong!==!!(s&&at+i>=Number(s.start)&&at+i<Number(s.end)))failures.push(`${id}:${at+i}`);}at+=c.text.length;}else walk(c);}}
  walk(JSON.parse(window.coverage.a.view().documentJson).root);return failures;
 },spans)).toEqual([]);
}
for(const mode of ["local","shared"]){
 for(const natural of [false,true])test(`${mode} ${natural?"natural":"explicit"} cross-container native coverage formats every intended character and recovers exactly`,async({page})=>{
  await ready(page,mode,natural?"&history=typing":"");const original=await document(page);
  await select(page,"range");const forward=await coverage(page);expect(forward.selectedUtf16).toBe("62");expect(forward.text).toHaveLength(16);expect(forward.nodes.find(n=>n.block==="table").extent).toBe("whole");expect(forward.nodes.find(n=>n.block==="quote").extent).toBe("partial");expect(forward.text.find(s=>s.block==="caption").domain).toEqual({kind:"caption",image:"image"});
  await select(page,"backward");const backward=await coverage(page);expect(backward.backward).toBe(true);expect(backward.text).toEqual(forward.text);const selection=await page.evaluate(()=>window.coverage.a.view().selection);
  await bold(page);await exactStrongCoverage(page,forward.text);expect(await page.evaluate(()=>window.coverage.a.view().selection)).toEqual(selection);expect(await page.evaluate(()=>window.coverage.a.view().undoDepth)).toBe(1);
  const after=await document(page);await reload(page);for(let i=0;i<2;i++){await history(page);expect(await document(page)).toBe(original);await history(page,true);expect(await document(page)).toBe(after);}await clean(page);
 });
 test(`${mode} merged-grid and whole-image formatting retain source domains, legacy reads and all unrelated text`,async({page})=>{
  await ready(page,mode);const before=await document(page);await select(page,"grid");const read=await coverage(page);expect(read.text.map(s=>s.block)).toEqual(["p-0-0","p-0-1","p-1-0","p-1-1"]);expect(read.selectedUtf16).toBe("16");
  expect(await page.evaluate(()=>window.coverage.core.inlineFormatState("breditor/strong").state.kind)).toBe("unavailable");await bold(page);await exactStrongCoverage(page,read.text);await history(page);expect(await document(page)).toBe(before);
  await select(page,"image");const image=await coverage(page);expect(image.text.map(s=>s.block)).toEqual(["caption"]);await bold(page);await exactStrongCoverage(page,image.text);expect(await page.evaluate(()=>window.coverage.core.selectionFormatState("breditor/strong").state.kind)).toBe("uniform");await history(page);expect(await document(page)).toBe(before);await clean(page);
 });
 test(`${mode} native node property patches keep mixed Link values through toolbar and exact recovery`,async({page})=>{
  await ready(page,mode);await page.evaluate(()=>{const t=window.coverage;for(const [start,end,href,target]of [[0,2,"https://one.test/",false],[2,4,"https://two.test/",true]]){const format={type:"breditor-inline/link",properties:{"breditor-inline/href":href,"breditor-inline/new-window":target}};if(t.shared)t.core.dispatch({commands:[{kind:"set_format",data:{block:"caption",offset:start,length:end-start,format,enabled:true}}]});else t.a.execute({kind:"setInlineFormat",data:{change:{kind:"set",formatsJson:JSON.stringify([format])},targets:[{block:"caption",start:String(start),end:String(end)}]}});}t.select({kind:"node",block:"image"});});
  const before=await document(page);expect(await page.evaluate(()=>window.coverage.core.selectionFormatState("breditor-inline/link").state)).toEqual({kind:"mixed",presentEverywhere:true});
  const prefix=mode==="local"?"rich":"shared",form=page.locator(`#a [data-${prefix}-control="link"]`);await form.locator("summary").click();await form.locator(`[data-${prefix}-field="link-href"]`).fill("https://changed.test/");await form.locator(`[data-${prefix}-field="link-href"]`).press("Enter");
  const links=page.locator('#a [data-rich-text="caption"] a');await expect(links).toHaveCount(2);await expect(links.nth(0)).toHaveAttribute("href","https://changed.test/");await expect(links.nth(1)).toHaveAttribute("href","https://changed.test/");await expect(links.nth(0)).not.toHaveAttribute("target");await expect(links.nth(1)).toHaveAttribute("target","_blank");
  const after=await document(page);await reload(page);await history(page);expect(await document(page)).toBe(before);await history(page,true);expect(await document(page)).toBe(after);await clean(page);
 });
 test(`${mode} custom empty toolbar retains native formatting keyboard/input while widgets composition and read-only own their keys`,async({page})=>{
  await ready(page,mode,"&toolbar=none&history=typing");const before=await document(page);await select(page,"grid");await page.keyboard.press("Control+b");await exactStrongCoverage(page,(await coverage(page)).text);await history(page);expect(await document(page)).toBe(before);
  await page.evaluate(()=>window.coverage.a.surface.dispatchEvent(new InputEvent("beforeinput",{bubbles:true,cancelable:true,inputType:"formatItalic"})));expect(await page.evaluate(()=>window.coverage.core.selectionFormatState("breditor-inline/italic").state.kind)).toBe("uniform");await history(page);expect(await document(page)).toBe(before);
  await page.locator('#a [data-task-check="task"]').focus();await page.keyboard.press("Control+b");expect(await document(page)).toBe(before);
  await select(page,"grid");await page.evaluate(()=>{const s=window.coverage.a.surface;s.dispatchEvent(new KeyboardEvent("keydown",{bubbles:true,cancelable:true,key:"b",ctrlKey:true,isComposing:true}));s.dispatchEvent(new InputEvent("beforeinput",{bubbles:true,cancelable:true,inputType:"formatBold",isComposing:true}));});expect(await document(page)).toBe(before);
  await page.evaluate(()=>window.coverage.a.setReadOnly(true));await page.keyboard.press("Control+b");expect(await document(page)).toBe(before);expect((await coverage(page)).scope).toBe("grid");await clean(page);
 });
 test(`${mode} native caret pending formats are UI-only and selection code refuses atomically without a partial format`,async({page})=>{
  await ready(page,mode,"&toolbar=none&history=typing");const before=await document(page);await page.evaluate(()=>{const t=window.coverage;t.select(t.range("z-intro",1));});await page.keyboard.press("Control+b");expect(await document(page)).toBe(before);expect(await page.evaluate(()=>window.coverage.a.view().undoDepth)).toBe(0);expect(await page.evaluate(()=>window.coverage.core.selectionFormatState("breditor/strong").state.kind)).toBe("uniform");
  await page.keyboard.type("X");expect(await page.evaluate(()=>window.coverage.a.view().undoDepth)).toBe(1);await history(page);expect(await document(page)).toBe(before);
  expect(await page.evaluate(()=>{const t=window.coverage;t.select(t.range("task-head",0,"code",4));const before=t.a.checkpointJson();let refused=false;try{t.change([{kind:"set",formatsJson:'[{"type":"breditor/strong","properties":{}}]'}]);}catch{refused=true;}return {refused,exact:before===t.a.checkpointJson(),state:t.core.selectionFormatState("breditor/strong").state.kind};})).toEqual({refused:true,exact:true,state:"unavailable"});await clean(page);
 });
}
test("shared native selection formatting preserves offline peer text and styles across selective history and restart",async({page})=>{
 await ready(page,"shared","&history=typing");await select(page,"grid");await bold(page);
 await page.evaluate(async()=>{const t=window.coverage;t.b.core.dispatch({commands:[{kind:"insert_text",data:{block:"p-0-0",offset:1,text:"Peer"}},{kind:"set_format",data:{block:"p-1-1",offset:0,length:4,format:{type:"breditor-inline/italic",properties:{}},enabled:true}}]});await t.sync();});
 const after=await document(page);await reload(page);await history(page);expect(await page.evaluate(()=>JSON.stringify(window.coverage.node("p-0-0")))).toContain("Peer");expect(await page.evaluate(()=>JSON.stringify(window.coverage.node("p-1-1")))).toContain("breditor-inline/italic");await history(page,true);expect(await document(page)).toBe(after);await clean(page);
});
for(const mode of ["local","shared"])test(`installed ${mode} React whole-node formatting retains owner and exact history after reload`,async({page})=>{
 const shared=mode==="shared";await page.goto(shared?"/shared-structural-react.html":"/structural-react.html");await expect(page.locator("#ready")).toHaveText("Ready");
 const before=await page.evaluate(shared=>{const t=shared?window.sharedV2React:window.v2React,e=t.ref.current.getEditor();t.original=e;if(shared)e.select({kind:"node",block:"tasks"});else e.execute({kind:"setSelection",selection:{kind:"node",block:"tasks"}});e.focus();return e.view().documentJson;},shared);
 await page.getByRole("toolbar").getByRole("button",{name:"Bold",exact:true}).click();const saved=await page.evaluate(async shared=>{const t=shared?window.sharedV2React:window.v2React,e=t.ref.current.getEditor();if(shared)await e.flush();else t.save();return {document:e.view().documentJson,checkpoint:e.checkpointJson()};},shared);expect(saved.document).not.toBe(before);
 await page.locator("#rerender").click();await expect(page.locator("#count")).toHaveText("1");expect(await page.evaluate(shared=>{const t=shared?window.sharedV2React:window.v2React;return t.original===t.ref.current.getEditor();},shared)).toBe(true);
 await page.reload();await expect(page.locator("#ready")).toHaveText("Ready");expect(await page.evaluate(shared=>(shared?window.sharedV2React:window.v2React).ref.current.checkpointJson(),shared)).toBe(saved.checkpoint);
 await page.evaluate(shared=>{const e=(shared?window.sharedV2React:window.v2React).ref.current.getEditor();if(shared)e.core.undo();else e.execute({kind:"undo"});},shared);expect(await page.evaluate(shared=>(shared?window.sharedV2React:window.v2React).ref.current.getEditor().view().documentJson,shared)).toBe(before);
 await page.evaluate(shared=>{const e=(shared?window.sharedV2React:window.v2React).ref.current.getEditor();if(shared)e.core.redo();else e.execute({kind:"redo"});},shared);expect(await page.evaluate(shared=>(shared?window.sharedV2React:window.v2React).ref.current.getEditor().view().documentJson,shared)).toBe(saved.document);expect(await page.evaluate(shared=>(shared?window.sharedV2React:window.v2React).errors,shared)).toEqual([]);
});
