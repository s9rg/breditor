import {test,expect} from "@playwright/test";
import {standardToolbarChecks} from "../rich-browser/standard-toolbar-checks.mjs";
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const {fixture}=await import("/standard-inline-fixture.mjs"),shared=fixture(window.sharedTools,true,true),selection=(block,start,end=start,affinity="after")=>({kind:"text",anchor:{block,offset:String(start),affinity},focus:{block,offset:String(end),affinity}});
  window.toolbarTest={...shared,owner:shared.a,editor:shared.da,host:document.querySelector("#a"),errors:shared.errors,k:shared.kinds,p:shared.properties,prefix:"shared",selection,
   select:(block,start,end=start,affinity="after")=>shared.da.select(selection(block,start,end,affinity)),pending:formats=>shared.a.setPendingFormats(formats),
   set:(block,start,end,type,properties={})=>shared.a.dispatch({commands:[shared.command(block,start,end-start,type,properties)]}),
   undo:()=>shared.a.undo(),redo:()=>shared.a.redo(),
   exactReload:before=>{const after=shared.a.documentJson();shared.a.undo();const undo=shared.a.documentJson()===before,saved=shared.a.checkpointJson();shared.da.dispose();const restored=new window.sharedTools.SharedRichEditor(shared.profile.restore("room",saved));try{restored.redo();const redo=restored.documentJson()===after;restored.undo();return {undo,redo,future:restored.documentJson()===before};}finally{restored.dispose();shared.dispose();}}
  };
 });
});
standardToolbarChecks("shared","#a");

test("bound standard controls reject a second owner before touching its host or either document",async({page})=>{
 const result=await page.evaluate(()=>{const t=window.toolbarTest,host=document.createElement("main");host.textContent="Keep host";const before=t.a.checkpointJson(),second=t.b.checkpointJson();let rejected=false;try{window.sharedTools.mountSharedEditor(host,{core:t.b,inlinePresentation:t.presentation,toolbar:window.sharedTools.createStandardSharedToolbarV1(t.a,t.presentation)});}catch(error){rejected=String(error).includes("different Rust owner");}return {rejected,host:host.textContent,first:t.a.checkpointJson()===before,second:t.b.checkpointJson()===second,errors:t.errors};});expect(result).toEqual({rejected:true,host:"Keep host",first:true,second:true,errors:[]});
});

test("remote publication makes a dirty Link draft stale without overwriting the remote change",async({page})=>{
 await page.evaluate(()=>window.toolbarTest.select("p",0,1));
 await page.locator('#a [data-shared-control="link"] summary').click();
 await page.locator('#a [data-shared-field="link-href"]').fill("https://draft.test/");
 const before=await page.evaluate(async()=>{const t=window.toolbarTest;t.b.dispatch({commands:[t.command("caption",0,1,t.kinds.italic)]});await t.synchronize();return t.a.documentJson();});
 await expect(page.locator('#a [data-shared-control="link"]')).toHaveAttribute("data-stale","");
 await page.locator('#a [data-shared-field="link-href"]').press("Enter");
 expect(await page.evaluate(()=>window.toolbarTest.owner.documentJson())).toBe(before);
 await expect(page.locator('#a [role="status"]')).toContainText("stale");
 await page.locator('#a [data-shared-field="link-href"]').press("Escape");
 await expect(page.locator('#a [role="textbox"]')).toBeFocused();
 expect(await page.evaluate(()=>window.toolbarTest.errors.length)).toBe(1);
});

test("offline toolbar changes converge and selective Undo retains the peer's formatting",async({page})=>{
 await page.evaluate(()=>window.toolbarTest.select("p",0,1));
 await page.locator('#a [data-shared-action="italic"]').click();
 await page.evaluate(()=>{const t=window.toolbarTest;t.db.select(t.selection("caption",0,1));});
 await page.locator('#b [data-shared-action="underline"]').click();
 const result=await page.evaluate(async()=>{const t=window.toolbarTest;await t.synchronize();const after=t.a.documentJson();t.a.undo();await t.synchronize();const undo={italic:!!t.da.surface.querySelector("em"),underline:t.da.surface.querySelector("figcaption u")?.textContent};t.a.redo();await t.synchronize();return {undo,redo:t.a.documentJson()===after,equal:t.a.documentJson()===t.b.documentJson(),errors:t.errors};});
 expect(result).toEqual({undo:{italic:false,underline:"x"},redo:true,equal:true,errors:[]});
});
